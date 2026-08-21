from __future__ import annotations

import hmac
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from starlette.concurrency import run_in_threadpool

from .enrollment import (
    EnrollmentRepository,
    SupabaseEnrollmentRepository,
    enrollment_code_digest,
)
from .errors import (
    DuplicateTeamInstallationError,
    ExpiredEnrollmentCodeError,
    InvalidEnrollmentCodeError,
    InvalidPayloadError,
    PayloadTooLargeError,
    RepositoryError,
    UnknownInstallationError,
)
from .ingestion import ingest as ingest_telemetry
from .repository import IngestionRepository, SupabaseRepository
from .settings import Settings
from .signing import InstallationTokenIssuer


class EnrollmentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: SecretStr
    computer_name: str = Field(min_length=1, max_length=255)


class EnrolledInstallationResponse(BaseModel):
    installation_id: str
    organization_id: str
    tool: str
    token: str


class EnrollmentResponse(BaseModel):
    collector_url: str
    installations: list[EnrolledInstallationResponse]


def create_app(
    settings: Settings | None = None,
    repository: IngestionRepository | None = None,
    enrollment_repository: EnrollmentRepository | None = None,
    token_issuer: InstallationTokenIssuer | None = None,
) -> FastAPI:
    # BaseSettings resolves required fields from environment at runtime.
    resolved_settings = settings or Settings()  # pyright: ignore[reportCallIssue]
    secret_key = resolved_settings.SUPABASE_SECRET_KEY.get_secret_value()
    resolved_repository = repository or SupabaseRepository(
        resolved_settings.SUPABASE_URL, secret_key
    )
    resolved_enrollment_repository = (
        enrollment_repository
        or SupabaseEnrollmentRepository(resolved_settings.SUPABASE_URL, secret_key)
    )
    resolved_token_issuer = token_issuer or InstallationTokenIssuer(
        resolved_settings.SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY.get_secret_value(),
        resolved_settings.SLOWPOKE_INSTALLATION_SIGNING_KID,
        str(resolved_settings.SLOWPOKE_INSTALLATION_ISSUER),
        resolved_settings.SLOWPOKE_COLLECTOR_AUDIENCE,
    )
    app = FastAPI(title="Slowpoke backend", docs_url=None, redoc_url=None)

    def authorize(authorization: Annotated[str | None, Header()] = None) -> None:
        expected = (
            f"Bearer {resolved_settings.SLOWPOKE_INGEST_TOKEN.get_secret_value()}"
        )
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @app.get("/healthz", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/.well-known/openid-configuration", include_in_schema=False)
    def openid_configuration() -> dict[str, object]:
        return resolved_token_issuer.discovery_document()

    @app.get("/.well-known/jwks.json", include_in_schema=False)
    def jwks() -> dict[str, object]:
        return resolved_token_issuer.jwks()

    @app.post(
        "/api/setup/enroll",
        response_model=EnrollmentResponse,
        status_code=status.HTTP_200_OK,
    )
    async def enroll(request: EnrollmentRequest) -> EnrollmentResponse:
        code_digest = enrollment_code_digest(request.code.get_secret_value())
        try:
            installations = await run_in_threadpool(
                resolved_enrollment_repository.redeem,
                code_digest,
                request.computer_name,
                datetime.now(UTC),
            )
        except InvalidEnrollmentCodeError as error:
            raise HTTPException(
                status_code=400, detail="invalid enrollment code"
            ) from error
        except ExpiredEnrollmentCodeError as error:
            raise HTTPException(
                status_code=410, detail="enrollment code expired"
            ) from error
        except DuplicateTeamInstallationError as error:
            raise HTTPException(
                status_code=409, detail="team installation name already in use"
            ) from error
        except RepositoryError as error:
            raise HTTPException(
                status_code=503,
                detail="enrollment unavailable",
                headers={"Retry-After": "5"},
            ) from error

        return EnrollmentResponse(
            collector_url=str(resolved_settings.SLOWPOKE_COLLECTOR_URL).rstrip("/"),
            installations=[
                EnrolledInstallationResponse(
                    installation_id=str(installation.id),
                    organization_id=str(installation.organization_id),
                    tool=installation.tool,
                    token=resolved_token_issuer.issue(installation),
                )
                for installation in installations
            ],
        )

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
                ingest_telemetry,
                signal,
                await request.body(),
                request.headers,
                resolved_repository,
                resolved_settings.SLOWPOKE_MAX_DECOMPRESSED_BYTES,
            )
        except PayloadTooLargeError as error:
            raise HTTPException(status_code=413, detail="payload too large") from error
        except InvalidPayloadError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except UnknownInstallationError as error:
            raise HTTPException(
                status_code=503,
                detail="unknown installation",
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
