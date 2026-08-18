from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from pathlib import Path
from uuid import uuid4

import pytest
import uvicorn
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import (
    ExportLogsServiceRequest,
)
from supabase import create_client

from slowpoke_backend.app import create_app
from slowpoke_backend.repository import SupabaseRepository
from slowpoke_backend.settings import Settings

from .helpers import new_signing_private_key

pytestmark = pytest.mark.local_e2e

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
COLLECTOR_ROOT = REPOSITORY_ROOT / "apps" / "collector"
SETUP_CLI = REPOSITORY_ROOT / "packages" / "setup" / "bin" / "slowpoke-setup.js"
COLLECTOR_IMAGE = (
    "ghcr.io/open-telemetry/opentelemetry-collector-releases/"
    "opentelemetry-collector-contrib:0.157.0"
)
LOCAL_USER_ID = "00000000-0000-4000-8000-000000000002"
CODEX_PROMPT = "Reply with exactly SLOWPOKE_CODEX_OTLP_OK. Do not use tools."
CLAUDE_PROMPT = "Reply with exactly SLOWPOKE_CLAUDE_OTLP_OK. Do not use tools."


def _require_environment() -> tuple[str, str]:
    if os.environ.get("SLOWPOKE_RUN_LOCAL_E2E") != "1":
        pytest.skip("set SLOWPOKE_RUN_LOCAL_E2E=1 to run the local CLI E2E")
    url = os.environ.get("SUPABASE_URL")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret_key:
        pytest.fail("SUPABASE_URL and SUPABASE_SECRET_KEY are required")
    for executable in ("docker", "node", "codex", "claude"):
        if shutil.which(executable) is None:
            pytest.fail(f"{executable} is required")
    return url, secret_key


def _free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


@contextmanager
def _backend_server(settings: Settings, port: int) -> Iterator[None]:
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(
                settings,
                SupabaseRepository(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_SECRET_KEY.get_secret_value(),
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
        yield
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@contextmanager
def _collector(
    backend_port: int,
    collector_port: int,
    ingest_token: str,
) -> Iterator[None]:
    container_name = f"slowpoke-local-e2e-{secrets.token_hex(6)}"
    issuer = f"http://host.docker.internal:{backend_port}"
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
            f"SLOWPOKE_INSTALLATION_ISSUER={issuer}",
            "--env",
            "SLOWPOKE_COLLECTOR_AUDIENCE=slowpoke-collector-e2e",
            "--env",
            "SLOWPOKE_INGEST_URL="
            f"http://host.docker.internal:{backend_port}/api/internal/telemetry",
            "--env",
            f"SLOWPOKE_INGEST_TOKEN={ingest_token}",
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
    try:
        _wait_for_collector(collector_port)
        yield
    finally:
        subprocess.run(
            ["docker", "stop", "--time", "10", container_name],
            check=False,
            capture_output=True,
            timeout=20,
        )


def _wait_for_collector(port: int) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/v1/logs",
            data=ExportLogsServiceRequest().SerializeToString(),
            headers={
                "Authorization": "Bearer invalid-readiness-token",
                "Content-Type": "application/x-protobuf",
            },
            method="POST",
        )
        try:
            urllib.request.urlopen(request, timeout=2)
        except urllib.error.HTTPError as error:
            if error.code == 401:
                return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.25)
    pytest.fail("local collector did not become ready")


def _run_cli(label: str, command: list[str], environment: dict[str, str]) -> str:
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
    return result.stdout


def _run_setup(code: str, backend_port: int, setup_home: Path) -> dict[str, object]:
    output = _run_cli(
        "setup",
        [
            "node",
            str(SETUP_CLI),
            "enroll",
            "--code",
            code,
            "--server",
            f"http://127.0.0.1:{backend_port}",
            "--computer-name",
            "Local E2E computer",
        ],
        {
            "HOME": str(setup_home),
            "CODEX_HOME": str(setup_home / ".codex"),
            "CLAUDE_CONFIG_DIR": str(setup_home / ".claude"),
        },
    )
    assert code not in output
    return json.loads(output)


def _configured_authorizations(setup_home: Path) -> tuple[str, str]:
    codex_config = (setup_home / ".codex" / "config.toml").read_text()
    match = re.search(r'authorization\s*=\s*"(Bearer [^"]+)"', codex_config)
    assert match
    claude_settings = json.loads((setup_home / ".claude" / "settings.json").read_text())
    claude_header = claude_settings["env"]["OTEL_EXPORTER_OTLP_HEADERS"]
    assert claude_header.startswith("Authorization=Bearer ")
    return match.group(1), claude_header.removeprefix("Authorization=")


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


def test_real_two_tool_enrollment_flows_through_collector_into_supabase() -> None:
    url, secret_key = _require_environment()
    service_client = create_client(url, secret_key)
    suffix = secrets.token_hex(8)
    organization = (
        service_client.table("organizations")
        .insert(
            {
                "name": f"Local E2E {suffix}",
                "created_by_user_id": LOCAL_USER_ID,
                "idempotency_key": str(uuid4()),
            }
        )
        .execute()
        .data[0]
    )
    organization_id = str(organization["id"])
    service_client.table("organization_members").insert(
        {
            "organization_id": organization_id,
            "user_id": LOCAL_USER_ID,
            "role": "admin",
        }
    ).execute()
    enrollment_code = secrets.token_urlsafe(24)
    service_client.table("installation_enrollments").insert(
        {
            "organization_id": organization_id,
            "created_by_user_id": LOCAL_USER_ID,
            "code_digest": hashlib.sha256(enrollment_code.encode()).hexdigest(),
            "selected_tools": ["codex", "claude_code"],
            "expires_at": "2099-01-01T00:00:00Z",
        }
    ).execute()
    ingest_token = secrets.token_urlsafe(24)
    backend_port = _free_port()
    collector_port = _free_port()
    endpoint = f"http://127.0.0.1:{collector_port}"
    settings = Settings(
        SLOWPOKE_INGEST_TOKEN=ingest_token,
        SUPABASE_URL=url,
        SUPABASE_SECRET_KEY=secret_key,
        SLOWPOKE_INSTALLATION_ISSUER=f"http://host.docker.internal:{backend_port}",
        SLOWPOKE_COLLECTOR_AUDIENCE="slowpoke-collector-e2e",
        SLOWPOKE_COLLECTOR_URL=endpoint,
        SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY=new_signing_private_key(),
        SLOWPOKE_INSTALLATION_SIGNING_KID="local-e2e-key",
    )

    try:
        with ExitStack() as stack:
            stack.enter_context(_backend_server(settings, backend_port))
            stack.enter_context(_collector(backend_port, collector_port, ingest_token))
            with tempfile.TemporaryDirectory(
                prefix="slowpoke-setup-home-"
            ) as directory:
                setup_home = Path(directory)
                setup_result = _run_setup(enrollment_code, backend_port, setup_home)
                assert setup_result["status"] == "success"
                assert {
                    installation["tool"]
                    for installation in setup_result["installations"]
                } == {"codex", "claude_code"}
                codex_authorization, claude_authorization = _configured_authorizations(
                    setup_home
                )
                _run_codex(endpoint, codex_authorization)
                _run_claude(endpoint, claude_authorization)

            deadline = time.monotonic() + 45
            prompts: list[dict[str, object]] = []
            batches: list[dict[str, object]] = []
            installations: list[dict[str, object]] = []
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
                installations = (
                    service_client.table("installations")
                    .select("id,tool,verified_at,last_seen_at,revoked_at")
                    .eq("organization_id", organization_id)
                    .execute()
                    .data
                )
                prompt_texts = {row["prompt_text"] for row in prompts}
                signals = {row["signal"] for row in batches}
                both_verified = len(installations) == 2 and all(
                    row["verified_at"] and row["last_seen_at"] and not row["revoked_at"]
                    for row in installations
                )
                if (
                    {CODEX_PROMPT, CLAUDE_PROMPT} <= prompt_texts
                    and signals == {"logs", "metrics", "traces"}
                    and both_verified
                ):
                    break
                time.sleep(1)
            else:
                pytest.fail(
                    "timed out waiting for two-tool prompts and signals; "
                    f"prompts={prompts}, batches={batches}, "
                    f"installations={installations}"
                )

            installation_by_tool = {
                str(row["tool"]): str(row["id"]) for row in installations
            }
            prompt_installations = {
                str(row["prompt_text"]): str(row["installation_id"]) for row in prompts
            }
            assert prompt_installations[CODEX_PROMPT] == installation_by_tool["codex"]
            assert (
                prompt_installations[CLAUDE_PROMPT]
                == installation_by_tool["claude_code"]
            )

            time.sleep(6)
            batches = (
                service_client.table("telemetry_batches")
                .select("id,signal,raw_payload")
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
                    ingest_token,
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
