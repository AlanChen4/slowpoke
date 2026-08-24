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
CLAUDE_RESPONSE = "SLOWPOKE_CLAUDE_OTLP_OK"
CLAUDE_TOOL_OUTPUT = "SLOWPOKE_CLAUDE_TOOL_OUTPUT"
CLAUDE_PROMPT = (
    f"Run `printf {CLAUDE_TOOL_OUTPUT}` with the Bash tool. Do not respond "
    f"until Bash returns, then reply with exactly {CLAUDE_RESPONSE}."
)
CLAUDE_SYSTEM_PROMPT = "You must complete the requested Bash call before answering."
MINIMUM_CLAUDE_TELEMETRY_VERSION = (2, 1, 214)


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
    claude_version = subprocess.run(
        ["claude", "--version"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    ).stdout
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", claude_version)
    if not match or tuple(map(int, match.groups())) < MINIMUM_CLAUDE_TELEMETRY_VERSION:
        pytest.fail(
            "Claude Code 2.1.214 or later is required to verify full content "
            "telemetry; "
            f"found {claude_version.strip()}"
        )
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
    for signal in ("logs", "metrics", "traces"):
        assert f"/v1/{signal}" in codex_config
    match = re.search(r'authorization\s*=\s*"(Bearer [^"]+)"', codex_config)
    assert match
    claude_settings = json.loads((setup_home / ".claude" / "settings.json").read_text())
    expected_content_settings = {
        "OTEL_LOG_ASSISTANT_RESPONSES": "1",
        "OTEL_LOG_TOOL_DETAILS": "1",
        "OTEL_LOG_TOOL_CONTENT": "1",
        "OTEL_LOG_RAW_API_BODIES": "1",
        "ENABLE_BETA_TRACING_DETAILED": "1",
    }
    for key, value in expected_content_settings.items():
        assert claude_settings["env"][key] == value
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
            "--setting-sources",
            "local",
            "--strict-mcp-config",
            "--mcp-config",
            '{"mcpServers":{}}',
            "--disable-slash-commands",
            "--print",
            "--no-session-persistence",
            "--tools",
            "Bash",
            "--allowedTools",
            "Bash(printf *)",
            "--permission-mode",
            "dontAsk",
            "--append-system-prompt",
            CLAUDE_SYSTEM_PROMPT,
            "--max-turns",
            "3",
            "--output-format",
            "text",
            CLAUDE_PROMPT,
        ],
        {
            "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
            "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",
            "ENABLE_BETA_TRACING_DETAILED": "1",
            "BETA_TRACING_ENDPOINT": endpoint,
            "OTEL_LOGS_EXPORTER": "otlp",
            "OTEL_METRICS_EXPORTER": "otlp",
            "OTEL_TRACES_EXPORTER": "otlp",
            "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
            "OTEL_EXPORTER_OTLP_ENDPOINT": endpoint,
            "OTEL_EXPORTER_OTLP_HEADERS": f"Authorization={authorization}",
            "OTEL_LOG_USER_PROMPTS": "1",
            "OTEL_LOG_ASSISTANT_RESPONSES": "1",
            "OTEL_LOG_TOOL_DETAILS": "1",
            "OTEL_LOG_TOOL_CONTENT": "1",
            "OTEL_LOG_RAW_API_BODIES": "1",
            "CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH": "262144",
            "OTEL_METRICS_INCLUDE_SESSION_ID": "true",
            "OTEL_METRICS_INCLUDE_VERSION": "true",
            "OTEL_METRICS_INCLUDE_ACCOUNT_UUID": "true",
            "OTEL_METRICS_INCLUDE_ENTRYPOINT": "true",
            "OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES": "true",
            "OTEL_LOGS_EXPORT_INTERVAL": "1000",
            "OTEL_METRIC_EXPORT_INTERVAL": "1000",
            "OTEL_TRACES_EXPORT_INTERVAL": "1000",
        },
    )


def _attribute_strings(record: dict[str, object]) -> dict[str, str]:
    attributes = record.get("attributes", [])
    if not isinstance(attributes, list):
        return {}
    strings: dict[str, str] = {}
    for attribute in attributes:
        if not isinstance(attribute, dict):
            continue
        key = attribute.get("key")
        value = attribute.get("value")
        if not isinstance(key, str) or not isinstance(value, dict):
            continue
        string_value = value.get("stringValue")
        if isinstance(string_value, str):
            strings[key] = string_value
    return strings


def _log_records(
    batches: list[dict[str, object]], installation_id: str
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for batch in batches:
        if (
            batch.get("signal") != "logs"
            or str(batch.get("installation_id")) != installation_id
        ):
            continue
        payload = batch.get("raw_payload")
        if not isinstance(payload, dict):
            continue
        for resource_log in payload.get("resourceLogs", []):
            for scope_log in resource_log.get("scopeLogs", []):
                records.extend(scope_log.get("logRecords", []))
    return records


def _event_name(record: dict[str, object]) -> str | None:
    attributes = _attribute_strings(record)
    body = record.get("body")
    body_value = body.get("stringValue") if isinstance(body, dict) else None
    candidates = (
        body_value,
        record.get("eventName"),
        attributes.get("event.name"),
    )
    return next((value for value in candidates if isinstance(value, str)), None)


def _event_records(
    batches: list[dict[str, object]], installation_id: str
) -> dict[str, list[dict[str, object]]]:
    events: dict[str, list[dict[str, object]]] = {}
    for record in _log_records(batches, installation_id):
        event_name = _event_name(record)
        if event_name is not None:
            events.setdefault(event_name, []).append(record)
    return events


def _batch_payload_text(
    batches: list[dict[str, object]], installation_id: str, signal: str
) -> str:
    payloads = [
        batch["raw_payload"]
        for batch in batches
        if batch.get("signal") == signal
        and str(batch.get("installation_id")) == installation_id
    ]
    return json.dumps(payloads, sort_keys=True)


def _signals_by_installation(
    batches: list[dict[str, object]],
) -> dict[str, set[str]]:
    signals: dict[str, set[str]] = {}
    for batch in batches:
        installation_id = str(batch["installation_id"])
        signals.setdefault(installation_id, set()).add(str(batch["signal"]))
    return signals


def _missing_claude_telemetry(
    batches: list[dict[str, object]], installation_id: str
) -> set[str]:
    events = _event_records(batches, installation_id)
    required_events = {
        "claude_code.user_prompt",
        "claude_code.assistant_response",
        "claude_code.tool_result",
        "claude_code.api_request_body",
        "claude_code.api_response_body",
    }
    missing = {f"event:{event}" for event in required_events - events.keys()}
    if missing:
        return missing

    assistant_responses = [
        _attribute_strings(record).get("response")
        for record in events["claude_code.assistant_response"]
    ]
    request_bodies = [
        _attribute_strings(record).get("body", "")
        for record in events["claude_code.api_request_body"]
    ]
    response_bodies = [
        _attribute_strings(record).get("body", "")
        for record in events["claude_code.api_response_body"]
    ]
    tool_results = json.dumps(events["claude_code.tool_result"], sort_keys=True)
    traces = _batch_payload_text(batches, installation_id, "traces")
    metrics = _batch_payload_text(batches, installation_id, "metrics")
    checks = {
        "assistant_response": CLAUDE_RESPONSE in assistant_responses,
        "api_request_body": any(CLAUDE_PROMPT in body for body in request_bodies),
        "api_response_body": any(CLAUDE_RESPONSE in body for body in response_bodies),
        "tool_result": CLAUDE_TOOL_OUTPUT in tool_results,
        "trace_tool_output": CLAUDE_TOOL_OUTPUT in traces,
        "trace_model_output": "response.model_output" in traces,
        "metric_app_version": "app.version" in metrics,
        "metric_entrypoint": "app.entrypoint" in metrics,
    }
    return {name for name, present in checks.items() if not present}


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
    service_client.table("installation_setup_sessions").insert(
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

                verification_deadline = time.monotonic() + 15
                setup_installations: list[dict[str, object]] = []
                while time.monotonic() < verification_deadline:
                    setup_installations = (
                        service_client.table("installations")
                        .select("id,tool,verified_at,last_seen_at,revoked_at")
                        .eq("organization_id", organization_id)
                        .execute()
                        .data
                    )
                    if len(setup_installations) == 2 and all(
                        row["verified_at"]
                        and row["last_seen_at"]
                        and not row["revoked_at"]
                        for row in setup_installations
                    ):
                        break
                    time.sleep(0.25)
                else:
                    pytest.fail(
                        "timed out waiting for both setup verification events; "
                        f"installations={setup_installations}"
                    )
                assert {row["tool"] for row in setup_installations} == {
                    "codex",
                    "claude_code",
                }

                _run_codex(endpoint, codex_authorization)
                _run_claude(endpoint, claude_authorization)

            deadline = time.monotonic() + 45
            prompts: list[dict[str, object]] = []
            batches: list[dict[str, object]] = []
            installations: list[dict[str, object]] = []
            claude_missing: set[str] = set()
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
                both_verified = len(installations) == 2 and all(
                    row["verified_at"] and row["last_seen_at"] and not row["revoked_at"]
                    for row in installations
                )
                installation_by_tool = {
                    str(row["tool"]): str(row["id"]) for row in installations
                }
                signals_by_installation = _signals_by_installation(batches)
                all_signals_from_both_tools = len(installation_by_tool) == 2 and all(
                    signals_by_installation.get(installation_id)
                    == {"logs", "metrics", "traces"}
                    for installation_id in installation_by_tool.values()
                )
                claude_installation_id = installation_by_tool.get("claude_code")
                claude_missing = (
                    _missing_claude_telemetry(batches, claude_installation_id)
                    if claude_installation_id is not None
                    else {"installation"}
                )
                if (
                    {CODEX_PROMPT, CLAUDE_PROMPT} <= prompt_texts
                    and all_signals_from_both_tools
                    and not claude_missing
                    and both_verified
                ):
                    break
                time.sleep(1)
            else:
                pytest.fail(
                    "timed out waiting for two-tool prompts and signals; "
                    f"prompt_texts={prompt_texts}, "
                    f"signals={signals_by_installation}, "
                    f"claude_missing={sorted(claude_missing)}, "
                    f"installation_count={len(installations)}"
                )

            installation_by_tool = {
                str(row["tool"]): str(row["id"]) for row in installations
            }
            assert _signals_by_installation(batches) == {
                installation_by_tool["codex"]: {"logs", "metrics", "traces"},
                installation_by_tool["claude_code"]: {"logs", "metrics", "traces"},
            }
            assert not _missing_claude_telemetry(
                batches, installation_by_tool["claude_code"]
            )
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
