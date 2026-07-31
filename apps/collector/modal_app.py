import subprocess
import time
from pathlib import Path

import modal

APP_NAME = "slowpoke-collector"
COLLECTOR_PORT = 4318
COLLECTOR_CONFIG_PATH = "/etc/otelcol-contrib/config.yaml"
COLLECTOR_IMAGE = (
    modal.Image.from_registry(
        "ghcr.io/open-telemetry/opentelemetry-collector-releases/"
        "opentelemetry-collector-contrib:0.157.0",
        add_python="3.13",
    )
    .add_local_file(
        Path(__file__).with_name("otelcol.yaml"),
        COLLECTOR_CONFIG_PATH,
        copy=True,
    )
)

app = modal.App(APP_NAME)


@app.server(
    image=COLLECTOR_IMAGE,
    secrets=[modal.Secret.from_name(APP_NAME)],
    port=COLLECTOR_PORT,
    cpu=0.125,
    memory=256,
    target_concurrency=50,
    min_containers=0,
    scaledown_window=600,
    startup_timeout=60,
    exit_grace_period=15,
    unauthenticated=True,
)
class Collector:
    @modal.enter()
    def start(self):
        self.process = subprocess.Popen(
            ["/otelcol-contrib", f"--config={COLLECTOR_CONFIG_PATH}"],
        )

        time.sleep(0.25)
        if self.process.poll() is not None:
            raise RuntimeError("OpenTelemetry Collector exited during startup")

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
