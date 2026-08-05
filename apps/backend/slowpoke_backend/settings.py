from __future__ import annotations

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=True,
        frozen=True,
        populate_by_name=True,
    )

    ingest_token: SecretStr = Field(
        validation_alias="SLOWPOKE_INGEST_TOKEN",
        min_length=1,
    )
    # Supabase does not share Slowpoke's environment-variable prefix.
    supabase_url: str = Field(validation_alias="SUPABASE_URL", min_length=1)
    supabase_secret_key: SecretStr = Field(
        validation_alias="SUPABASE_SECRET_KEY",
        min_length=1,
    )
    max_decompressed_bytes: int = Field(
        default=16 * 1024 * 1024,
        validation_alias="SLOWPOKE_MAX_DECOMPRESSED_BYTES",
        gt=0,
    )
