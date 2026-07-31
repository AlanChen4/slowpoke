import base64
import json
import os
import threading
import time

import modal

INGEST_TOKEN_ENV = "SLOWPOKE_E2E_INGEST_TOKEN"
SINK_PORT = 8000

app = modal.App("slowpoke-collector-e2e-sink")

if modal.is_local():
    sink_secret = modal.Secret.from_local_environ([INGEST_TOKEN_ENV])
else:
    sink_secret = modal.Secret.from_dict({})


@app.function(
    secrets=[sink_secret],
    min_containers=1,
    max_containers=1,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(SINK_PORT)
def sink():
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    captures: list[dict[str, object]] = []
    captures_lock = threading.Lock()
    expected_authorization = f"Bearer {os.environ[INGEST_TOKEN_ENV]}"

    class SinkHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            signal = self.path.removeprefix("/v1/")
            if signal not in {"logs", "metrics", "traces"}:
                self._respond(404)
                return
            if self.headers.get("authorization") != expected_authorization:
                self._respond(401)
                return

            length = int(self.headers.get("content-length", "0"))
            body = self.rfile.read(length)
            with captures_lock:
                captures.append(
                    {
                        "signal": signal,
                        "content_type": self.headers.get("content-type", ""),
                        "content_encoding": self.headers.get(
                            "content-encoding",
                            "",
                        ),
                        "body": base64.b64encode(body).decode("ascii"),
                        "captured_at": time.time(),
                    }
                )
            self._respond(200, content_type="application/x-protobuf")

        def do_GET(self):
            if self.path != "/captures":
                self._respond(404)
                return

            with captures_lock:
                body = json.dumps({"captures": list(captures)}).encode()
            self._respond(200, body, "application/json")

        def _respond(
            self,
            status: int,
            body: bytes = b"",
            content_type: str = "text/plain",
        ):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            return

    server = ThreadingHTTPServer(("0.0.0.0", SINK_PORT), SinkHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
