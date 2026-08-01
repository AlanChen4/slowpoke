from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from starlette.concurrency import run_in_threadpool

from .errors import (
    InvalidPayloadError,
    PayloadTooLargeError,
    RepositoryError,
    UnknownInstallationError,
)
from .repository import IngestionRepository, SupabaseRepository
from .service import IngestionService
from .settings import Settings


def create_app(
    settings: Settings | None = None,
    repository: IngestionRepository | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_environment()
    resolved_repository = repository or SupabaseRepository(
        resolved_settings.supabase_url,
        resolved_settings.supabase_secret_key,
    )
    service = IngestionService(
        resolved_repository, resolved_settings.max_decompressed_bytes
    )
    app = FastAPI(title="Slowpoke ingestion backend", docs_url=None, redoc_url=None)

    def authorize(authorization: Annotated[str | None, Header()] = None) -> None:
        expected = f"Bearer {resolved_settings.ingest_token}"
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @app.get("/healthz", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post(
        "/api/internal/telemetry/v1/{signal}",
        status_code=status.HTTP_200_OK,
        dependencies=[Depends(authorize)],
    )
    async def ingest(signal: str, request: Request) -> Response:
        if signal not in ("logs", "metrics", "traces"):
            raise HTTPException(status_code=404, detail="unknown signal")
        try:
            await run_in_threadpool(
                service.ingest,
                signal,
                await request.body(),
                request.headers,
            )
        except PayloadTooLargeError as error:
            raise HTTPException(status_code=413, detail="payload too large") from error
        except InvalidPayloadError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except UnknownInstallationError as error:
            raise HTTPException(
                status_code=503,
                detail="unknown or revoked installation",
                headers={"Retry-After": "30"},
            ) from error
        except RepositoryError as error:
            raise HTTPException(
                status_code=503,
                detail="telemetry persistence unavailable",
                headers={"Retry-After": "5"},
            ) from error
        return Response(content=b"{}", media_type="application/json")

    return app
