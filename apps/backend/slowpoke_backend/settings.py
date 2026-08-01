from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    ingest_token: str
    supabase_url: str
    supabase_secret_key: str
    max_decompressed_bytes: int = 16 * 1024 * 1024

    @classmethod
    def from_environment(cls) -> Settings:
        return cls(
            ingest_token=_required("SLOWPOKE_INGEST_TOKEN"),
            supabase_url=_required("SUPABASE_URL"),
            supabase_secret_key=_required("SUPABASE_SECRET_KEY"),
        )


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value
