from __future__ import annotations

from pydantic import AnyHttpUrl, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=True,
        frozen=True,
    )

    SLOWPOKE_INGEST_TOKEN: SecretStr = Field(min_length=1)
    SUPABASE_URL: str = Field(min_length=1)
    SUPABASE_SECRET_KEY: SecretStr = Field(min_length=1)
    SLOWPOKE_INSTALLATION_ISSUER: AnyHttpUrl
    SLOWPOKE_COLLECTOR_AUDIENCE: str = Field(min_length=1)
    SLOWPOKE_COLLECTOR_URL: AnyHttpUrl
    SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY: SecretStr = Field(min_length=1)
    SLOWPOKE_INSTALLATION_SIGNING_KID: str = Field(min_length=1, max_length=128)
    SLOWPOKE_MAX_DECOMPRESSED_BYTES: int = Field(
        default=16 * 1024 * 1024,
        gt=0,
    )
