import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import modal

APP_NAME = "slowpoke-collector"
COLLECTOR_PORT = 4318
COLLECTOR_CONFIG_PATH = "/etc/otelcol-contrib/config.yaml"
COLLECTOR_ROOT = Path(__file__).parent
COLLECTOR_IMAGE = modal.Image.from_dockerfile(
    COLLECTOR_ROOT / "Dockerfile",
    context_dir=COLLECTOR_ROOT,
).add_local_file(
    COLLECTOR_ROOT / "otelcol.yaml",
    COLLECTOR_CONFIG_PATH,
)


class CollectorLifecycle:
    @modal.enter()
    def start(self):
        self.process = subprocess.Popen(
            ["/otelcol-contrib", f"--config={COLLECTOR_CONFIG_PATH}"],
        )

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise RuntimeError("OpenTelemetry Collector exited during startup")

            try:
                with urllib.request.urlopen(
                    "http://127.0.0.1:13133/",
                    timeout=0.5,
                ) as response:
                    if response.status == 200:
                        return
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.1)

        raise RuntimeError("OpenTelemetry Collector health check timed out")

    @modal.exit()
    def stop(self):
        if self.process.poll() is not None:
            return

        self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)


def register_collector(app: modal.App, secret: modal.Secret):
    return app.server(
        image=COLLECTOR_IMAGE,
        secrets=[secret],
        port=COLLECTOR_PORT,
        cpu=0.125,
        memory=256,
        target_concurrency=50,
        min_containers=0,
        scaledown_window=600,
        startup_timeout=60,
        exit_grace_period=15,
        unauthenticated=True,
    )(CollectorLifecycle)
