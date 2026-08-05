from __future__ import annotations

import pytest
from pydantic import ValidationError

from slowpoke_backend.settings import Settings


def test_reads_required_values_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SLOWPOKE_INGEST_TOKEN", "ingest-token")
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:55321")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "secret-key")
    monkeypatch.setenv("SLOWPOKE_MAX_DECOMPRESSED_BYTES", "1024")

    settings = Settings()

    assert settings.ingest_token.get_secret_value() == "ingest-token"
    assert settings.supabase_url == "http://127.0.0.1:55321"
    assert settings.supabase_secret_key.get_secret_value() == "secret-key"
    assert settings.max_decompressed_bytes == 1024


def test_rejects_missing_required_values(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "SLOWPOKE_INGEST_TOKEN",
        "SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
    ):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(ValidationError):
        Settings()
