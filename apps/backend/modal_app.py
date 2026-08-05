from pathlib import Path

import modal

APP_NAME = "slowpoke-backend"
BACKEND_ROOT = Path(__file__).parent

app = modal.App(APP_NAME)
image = (
    modal.Image.debian_slim(python_version="3.13")
    .uv_sync(uv_project_dir=str(BACKEND_ROOT))
    .add_local_python_source("slowpoke_backend")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name(APP_NAME)],
    cpu=0.125,
    memory=256,
    min_containers=0,
    scaledown_window=600,
    timeout=60,
)
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def web():
    from slowpoke_backend import create_app

    return create_app()
