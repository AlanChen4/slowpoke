import base64
import gzip
import hashlib
import json
import os
import queue
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from google.protobuf import json_format
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import (
    ExportLogsServiceRequest,
)
from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import (
    ExportMetricsServiceRequest,
)
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
    ExportTraceServiceRequest,
)

COLLECTOR_ROOT = Path(__file__).resolve().parents[1]
MODAL_URL_PATTERN = re.compile(
    r"https://[a-zA-Z0-9.-]+\.modal\.(?:direct|host|run)"
)
ANSI_PATTERN = re.compile(r"\x1b\[[0-9;]*m")
INSTALLATION_ID = "slowpoke-e2e"
INSTALLATION_PASSWORD = "slowpoke-e2e-password"
SIGNAL_REQUEST_TYPES = {
    "logs": ExportLogsServiceRequest,
    "metrics": ExportMetricsServiceRequest,
    "traces": ExportTraceServiceRequest,
}


class ModalServe:
    def __init__(self, app_ref: Path, environment: dict[str, str], name: str):
        modal = shutil.which("modal") or str(Path(sys.executable).with_name("modal"))
        if not Path(modal).is_file():
            raise RuntimeError("modal is unavailable; run this test with uv")

        process_environment = os.environ.copy()
        process_environment.update(environment)
        suffix_source = f"{os.getpid()}:{name}".encode()
        process_environment["MODAL_DEV_SUFFIX"] = hashlib.sha256(
            suffix_source
        ).hexdigest()[:8]
        self.process = subprocess.Popen(
            [
                modal,
                "serve",
                "--timeout",
                "300",
                str(app_ref),
            ],
            cwd=COLLECTOR_ROOT,
            env=process_environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self.lines: list[str] = []
        self._line_queue: queue.Queue[str] = queue.Queue()
        self._reader_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._reader_thread.start()
        try:
            self.url = self._wait_for_url()
        except BaseException:
            self.stop()
            raise

    def _wait_for_url(self, timeout: float = 120) -> str:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            try:
                clean_line = self._line_queue.get(timeout=min(0.5, remaining))
            except queue.Empty:
                if self.process.poll() is not None:
                    break
                continue

            recent_output = "".join(self.lines[-4:])
            compact_output = re.sub(r"\s+", "", recent_output)
            match = MODAL_URL_PATTERN.search(compact_output)
            if match:
                return match.group(0)

        output = "".join(self.lines[-80:])
        if (
            "billing cycle spend limit" in output
            or "exceeded its spend limit" in output
        ):
            raise RuntimeError(
                "Modal stopped the ephemeral app at the billing-cycle spend limit"
            )
        raise RuntimeError(f"modal serve did not publish a URL:\n{output}")

    def _read_stdout(self):
        assert self.process.stdout is not None
        for line in self.process.stdout:
            clean_line = ANSI_PATTERN.sub("", line)
            self.lines.append(clean_line)
            self._line_queue.put(clean_line)

    def stop(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=10)


def _http_json(url: str) -> dict[str, object]:
    with urllib.request.urlopen(url, timeout=15) as response:
        return json.loads(response.read())


def _warm_collector(url: str, basic_authorization: str):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        try:
            _post_otlp(
                url,
                "logs",
                ExportLogsServiceRequest(),
                basic_authorization,
            )
            return
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            time.sleep(1)

    raise RuntimeError("collector did not accept OTLP/HTTP before timeout")


def _post_otlp(
    collector_url: str,
    signal: str,
    message,
    basic_authorization: str,
):
    request = urllib.request.Request(
        f"{collector_url}/v1/{signal}",
        data=message.SerializeToString(),
        headers={
            "Authorization": basic_authorization,
            "Content-Type": "application/x-protobuf",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 200


def _decode_capture(capture: dict[str, object]):
    signal = str(capture["signal"])
    body = base64.b64decode(str(capture["body"]))
    if capture["content_encoding"] == "gzip":
        body = gzip.decompress(body)

    request = SIGNAL_REQUEST_TYPES[signal]()
    if "json" in str(capture["content_type"]):
        json_format.Parse(body.decode("utf-8"), request)
    else:
        request.ParseFromString(body)
    return request


def _resource_attributes(request) -> list[dict[str, object]]:
    resource_groups = next(
        getattr(request, field)
        for field in ("resource_logs", "resource_metrics", "resource_spans")
        if hasattr(request, field)
    )
    resources = []
    for group in resource_groups:
        attributes = {}
        for attribute in group.resource.attributes:
            attributes[attribute.key] = json_format.MessageToDict(attribute.value)
        resources.append(attributes)
    return resources


def _test_credentials() -> tuple[str, str, str]:
    ingest_token = secrets.token_urlsafe(24)
    digest = base64.b64encode(
        hashlib.sha1(INSTALLATION_PASSWORD.encode()).digest()
    ).decode("ascii")
    htpasswd = f"{INSTALLATION_ID}:{{SHA}}{digest}"
    authorization = "Basic " + base64.b64encode(
        f"{INSTALLATION_ID}:{INSTALLATION_PASSWORD}".encode()
    ).decode("ascii")
    return ingest_token, htpasswd, authorization


def _start_test_servers(
    ingest_token: str,
    htpasswd: str,
) -> tuple[ModalServe, ModalServe]:
    sink_server = ModalServe(
        COLLECTOR_ROOT / "tests" / "modal_sink.py",
        {"SLOWPOKE_E2E_INGEST_TOKEN": ingest_token},
        "sink",
    )
    try:
        collector_server = ModalServe(
            COLLECTOR_ROOT / "tests" / "modal_collector.py",
            {
                "SLOWPOKE_OTLP_HTPASSWD": htpasswd,
                "SLOWPOKE_INGEST_URL": sink_server.url,
                "SLOWPOKE_INGEST_TOKEN": ingest_token,
            },
            "collector",
        )
    except BaseException:
        sink_server.stop()
        raise
    return sink_server, collector_server


def _synthetic_requests():
    logs = ExportLogsServiceRequest()
    log_record = logs.resource_logs.add().scope_logs.add().log_records.add()
    log_record.body.string_value = "SLOWPOKE_SYNTHETIC_LOG"

    metrics = ExportMetricsServiceRequest()
    metric = metrics.resource_metrics.add().scope_metrics.add().metrics.add()
    metric.name = "slowpoke.synthetic.metric"
    metric.gauge.data_points.add().as_int = 1

    traces = ExportTraceServiceRequest()
    span = traces.resource_spans.add().scope_spans.add().spans.add()
    span.trace_id = b"\x01" * 16
    span.span_id = b"\x02" * 8
    span.name = "slowpoke.synthetic.span"
    return {"logs": logs, "metrics": metrics, "traces": traces}


def test_decode_gzipped_otlp_json_capture():
    logs = ExportLogsServiceRequest()
    logs.resource_logs.add().scope_logs.add().log_records.add().body.string_value = (
        "SLOWPOKE_DECODE_TEST"
    )
    body = json_format.MessageToJson(logs).encode()
    capture = {
        "signal": "logs",
        "content_type": "application/json",
        "content_encoding": "gzip",
        "body": base64.b64encode(gzip.compress(body)).decode(),
    }
    decoded = _decode_capture(capture)
    assert (
        decoded.resource_logs[0].scope_logs[0].log_records[0].body.string_value
        == "SLOWPOKE_DECODE_TEST"
    )


def test_synthetic_requests_cover_every_collector_pipeline():
    requests = _synthetic_requests()
    assert set(requests) == {"logs", "metrics", "traces"}
    assert requests["logs"].resource_logs
    assert requests["metrics"].resource_metrics
    assert requests["traces"].resource_spans


@pytest.mark.modal_e2e
def test_modal_collector_forwards_all_otlp_signals():
    if os.environ.get("SLOWPOKE_RUN_MODAL_E2E") != "1":
        pytest.skip("set SLOWPOKE_RUN_MODAL_E2E=1 to run Modal collector test")

    ingest_token, htpasswd, authorization = _test_credentials()
    sink_server, collector_server = _start_test_servers(ingest_token, htpasswd)
    try:
        _warm_collector(collector_server.url, authorization)
        for signal, request in _synthetic_requests().items():
            _post_otlp(collector_server.url, signal, request, authorization)

        deadline = time.monotonic() + 60
        latest_captures = []
        latest_text = ""
        while time.monotonic() < deadline:
            payload = _http_json(f"{sink_server.url}/captures")
            latest_captures = list(payload["captures"])
            decoded = [_decode_capture(capture) for capture in latest_captures]
            latest_text = json.dumps(
                [json_format.MessageToDict(request) for request in decoded],
                sort_keys=True,
            )
            if all(
                marker in latest_text
                for marker in (
                    "SLOWPOKE_SYNTHETIC_LOG",
                    "slowpoke.synthetic.metric",
                    "slowpoke.synthetic.span",
                )
            ):
                break
            time.sleep(1)
        else:
            raise AssertionError(
                "timed out waiting for synthetic OTLP signals; "
                f"captures={len(latest_captures)}, data={latest_text[-4000:]}"
            )

        resources = [
            attributes
            for request in decoded
            for attributes in _resource_attributes(request)
        ]
        assert resources
        assert all(
            attributes["slowpoke.installation.id"]["stringValue"]
            == INSTALLATION_ID
            for attributes in resources
        )
    finally:
        collector_server.stop()
        sink_server.stop()
