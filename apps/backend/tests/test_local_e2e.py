from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from pathlib import Path

import pytest
import uvicorn
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import (
    ExportLogsServiceRequest,
)
from supabase import create_client

from slowpoke_backend.app import create_app
from slowpoke_backend.repository import SupabaseRepository
from slowpoke_backend.settings import Settings

pytestmark = pytest.mark.local_e2e

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
COLLECTOR_ROOT = REPOSITORY_ROOT / "apps" / "collector"
COLLECTOR_IMAGE = (
    "ghcr.io/open-telemetry/opentelemetry-collector-releases/"
    "opentelemetry-collector-contrib:0.157.0"
)
CODEX_PROMPT = "Reply with exactly SLOWPOKE_CODEX_OTLP_OK. Do not use tools."
CLAUDE_PROMPT = "Reply with exactly SLOWPOKE_CLAUDE_OTLP_OK. Do not use tools."


def _require_environment() -> tuple[str, str]:
    if os.environ.get("SLOWPOKE_RUN_LOCAL_E2E") != "1":
        pytest.skip("set SLOWPOKE_RUN_LOCAL_E2E=1 to run the local CLI E2E")
    url = os.environ.get("SUPABASE_URL")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret_key:
        pytest.fail("SUPABASE_URL and SUPABASE_SECRET_KEY are required")
    for executable in ("docker", "codex", "claude"):
        if shutil.which(executable) is None:
            pytest.fail(f"{executable} is required")
    return url, secret_key


def _free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


@contextmanager
def _backend_server(settings: Settings) -> Iterator[int]:
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(
                settings,
                SupabaseRepository(
                    settings.supabase_url,
                    settings.supabase_secret_key.get_secret_value(),
                ),
            ),
            host="0.0.0.0",
            port=port,
            log_level="warning",
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    if not server.started:
        pytest.fail("local FastAPI backend did not start")
    try:
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@contextmanager
def _collector(backend_port: int, installation_id: str, token: str) -> Iterator[int]:
    password = secrets.token_urlsafe(18)
    digest = base64.b64encode(hashlib.sha1(password.encode()).digest()).decode()
    htpasswd = f"{installation_id}:{{SHA}}{digest}"
    collector_port = _free_port()
    container_name = f"slowpoke-local-e2e-{secrets.token_hex(6)}"

    subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--detach",
            "--name",
            container_name,
            "--add-host",
            "host.docker.internal:host-gateway",
            "--publish",
            f"127.0.0.1:{collector_port}:4318",
            "--env",
            f"SLOWPOKE_OTLP_HTPASSWD={htpasswd}",
            "--env",
            "SLOWPOKE_INGEST_URL="
            f"http://host.docker.internal:{backend_port}/api/internal/telemetry",
            "--env",
            f"SLOWPOKE_INGEST_TOKEN={token}",
            "--volume",
            f"{COLLECTOR_ROOT / 'otelcol.yaml'}:/etc/otelcol-contrib/config.yaml:ro",
            COLLECTOR_IMAGE,
            "--config=/etc/otelcol-contrib/config.yaml",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    authorization = (
        "Basic " + base64.b64encode(f"{installation_id}:{password}".encode()).decode()
    )
    try:
        _wait_for_collector(collector_port, authorization)
        os.environ["SLOWPOKE_E2E_BASIC_AUTHORIZATION"] = authorization
        yield collector_port
    finally:
        os.environ.pop("SLOWPOKE_E2E_BASIC_AUTHORIZATION", None)
        subprocess.run(
            ["docker", "stop", "--time", "10", container_name],
            check=False,
            capture_output=True,
            timeout=20,
        )


def _wait_for_collector(port: int, authorization: str) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/v1/logs",
            data=ExportLogsServiceRequest().SerializeToString(),
            headers={
                "Authorization": authorization,
                "Content-Type": "application/x-protobuf",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            time.sleep(0.25)
    pytest.fail("local collector did not become ready")


def _run_cli(label: str, command: list[str], environment: dict[str, str]) -> None:
    process_environment = os.environ.copy()
    process_environment.update(environment)
    with tempfile.TemporaryDirectory(prefix=f"slowpoke-{label}-") as directory:
        result = subprocess.run(
            command,
            cwd=directory,
            env=process_environment,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
    if result.returncode != 0:
        pytest.fail(
            f"{label} exited {result.returncode}:\n"
            f"{result.stdout[-2000:]}\n{result.stderr[-2000:]}"
        )


def _codex_exporter(signal: str, endpoint: str, authorization: str) -> str:
    return (
        '{ otlp-http = { endpoint = "'
        f'{endpoint}/v1/{signal}", protocol = "binary", '
        f'headers = {{ authorization = "{authorization}" }}'
        " } }"
    )


def _run_codex(endpoint: str, authorization: str) -> None:
    codex = shutil.which("codex")
    assert codex is not None
    _run_cli(
        "codex",
        [
            codex,
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--strict-config",
            "--sandbox",
            "read-only",
            "-c",
            'approval_policy="never"',
            "-c",
            'otel.environment="test"',
            "-c",
            "otel.log_user_prompt=true",
            "-c",
            f"otel.exporter={_codex_exporter('logs', endpoint, authorization)}",
            "-c",
            "otel.metrics_exporter="
            f"{_codex_exporter('metrics', endpoint, authorization)}",
            "-c",
            f"otel.trace_exporter={_codex_exporter('traces', endpoint, authorization)}",
            CODEX_PROMPT,
        ],
        {},
    )


def _run_claude(endpoint: str, authorization: str) -> None:
    claude = shutil.which("claude")
    assert claude is not None
    _run_cli(
        "claude",
        [
            claude,
            "--safe-mode",
            "--print",
            "--no-session-persistence",
            "--tools",
            "",
            "--output-format",
            "text",
            CLAUDE_PROMPT,
        ],
        {
            "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
            "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",
            "OTEL_LOGS_EXPORTER": "otlp",
            "OTEL_METRICS_EXPORTER": "otlp",
            "OTEL_TRACES_EXPORTER": "otlp",
            "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
            "OTEL_EXPORTER_OTLP_ENDPOINT": endpoint,
            "OTEL_EXPORTER_OTLP_HEADERS": f"Authorization={authorization}",
            "OTEL_LOG_USER_PROMPTS": "1",
            "OTEL_LOG_ASSISTANT_RESPONSES": "0",
            "OTEL_LOGS_EXPORT_INTERVAL": "1000",
            "OTEL_METRIC_EXPORT_INTERVAL": "1000",
            "OTEL_TRACES_EXPORT_INTERVAL": "1000",
        },
    )


def _post_raw(backend_port: int, signal: str, payload: object, token: str) -> None:
    request = urllib.request.Request(
        f"http://127.0.0.1:{backend_port}/api/internal/telemetry/v1/{signal}",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        assert response.status == 200


def test_real_clis_flow_through_collector_into_supabase() -> None:
    url, secret_key = _require_environment()
    service_client = create_client(url, secret_key)
    suffix = secrets.token_hex(8)
    organization = (
        service_client.table("organizations")
        .insert({"name": f"Local E2E {suffix}"})
        .execute()
        .data[0]
    )
    organization_id = str(organization["id"])
    installation = (
        service_client.table("installations")
        .insert({"organization_id": organization_id})
        .execute()
        .data[0]
    )
    installation_id = str(installation["id"])
    token = secrets.token_urlsafe(24)
    settings = Settings(
        ingest_token=token,
        supabase_url=url,
        supabase_secret_key=secret_key,
    )

    try:
        with ExitStack() as stack:
            backend_port = stack.enter_context(_backend_server(settings))
            collector_port = stack.enter_context(
                _collector(backend_port, installation_id, token)
            )
            endpoint = f"http://127.0.0.1:{collector_port}"
            authorization = os.environ["SLOWPOKE_E2E_BASIC_AUTHORIZATION"]
            _run_codex(endpoint, authorization)
            _run_claude(endpoint, authorization)

            deadline = time.monotonic() + 45
            prompts: list[dict[str, object]] = []
            batches: list[dict[str, object]] = []
            while time.monotonic() < deadline:
                prompts = (
                    service_client.table("prompt_events")
                    .select("prompt_text,organization_id,installation_id")
                    .eq("organization_id", organization_id)
                    .execute()
                    .data
                )
                batches = (
                    service_client.table("telemetry_batches")
                    .select("id,signal,raw_payload,organization_id,installation_id")
                    .eq("organization_id", organization_id)
                    .execute()
                    .data
                )
                prompt_texts = {row["prompt_text"] for row in prompts}
                signals = {row["signal"] for row in batches}
                if {CODEX_PROMPT, CLAUDE_PROMPT} <= prompt_texts and signals == {
                    "logs",
                    "metrics",
                    "traces",
                }:
                    break
                time.sleep(1)
            else:
                pytest.fail(
                    "timed out waiting for prompts and signals; "
                    f"prompts={prompts}, batches={batches}"
                )

            assert {
                (row["organization_id"], row["installation_id"])
                for row in [*prompts, *batches]
            } == {(organization_id, installation_id)}

            # Let the collector's five-second batch window drain before replaying.
            time.sleep(6)
            batches = (
                service_client.table("telemetry_batches")
                .select("id,signal,raw_payload,organization_id,installation_id")
                .eq("organization_id", organization_id)
                .execute()
                .data
            )
            prompts = (
                service_client.table("prompt_events")
                .select("id")
                .eq("organization_id", organization_id)
                .execute()
                .data
            )
            counts_before = (len(batches), len(prompts))
            for batch in batches:
                _post_raw(
                    backend_port,
                    str(batch["signal"]),
                    batch["raw_payload"],
                    token,
                )
            batches_after = (
                service_client.table("telemetry_batches")
                .select("id")
                .eq("organization_id", organization_id)
                .execute()
                .data
            )
            prompts_after = (
                service_client.table("prompt_events")
                .select("id")
                .eq("organization_id", organization_id)
                .execute()
                .data
            )
            assert (len(batches_after), len(prompts_after)) == counts_before
    finally:
        service_client.table("organizations").delete().eq(
            "id", organization_id
        ).execute()
