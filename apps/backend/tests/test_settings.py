from __future__ import annotations

import pytest
from pydantic import ValidationError

from slowpoke_backend.settings import Settings

from .helpers import TEST_SIGNING_PRIVATE_KEY


def test_reads_required_values_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SLOWPOKE_INGEST_TOKEN", "ingest-token")
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:55321")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "secret-key")
    monkeypatch.setenv("SLOWPOKE_INSTALLATION_ISSUER", "https://issuer.example.test")
    monkeypatch.setenv("SLOWPOKE_COLLECTOR_AUDIENCE", "https://collector.example.test")
    monkeypatch.setenv("SLOWPOKE_COLLECTOR_URL", "https://collector.example.test")
    monkeypatch.setenv(
        "SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY", TEST_SIGNING_PRIVATE_KEY
    )
    monkeypatch.setenv("SLOWPOKE_INSTALLATION_SIGNING_KID", "test-key")
    monkeypatch.setenv("SLOWPOKE_MAX_DECOMPRESSED_BYTES", "1024")

    settings = Settings()

    assert settings.SLOWPOKE_INGEST_TOKEN.get_secret_value() == "ingest-token"
    assert settings.SUPABASE_URL == "http://127.0.0.1:55321"
    assert settings.SUPABASE_SECRET_KEY.get_secret_value() == "secret-key"
    assert str(settings.SLOWPOKE_INSTALLATION_ISSUER) == "https://issuer.example.test/"
    assert settings.SLOWPOKE_COLLECTOR_AUDIENCE == "https://collector.example.test"
    assert str(settings.SLOWPOKE_COLLECTOR_URL) == "https://collector.example.test/"
    assert (
        settings.SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY.get_secret_value()
        == TEST_SIGNING_PRIVATE_KEY
    )
    assert settings.SLOWPOKE_INSTALLATION_SIGNING_KID == "test-key"
    assert settings.SLOWPOKE_MAX_DECOMPRESSED_BYTES == 1024


def test_rejects_missing_required_values(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "SLOWPOKE_INGEST_TOKEN",
        "SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
        "SLOWPOKE_INSTALLATION_ISSUER",
        "SLOWPOKE_COLLECTOR_AUDIENCE",
        "SLOWPOKE_COLLECTOR_URL",
        "SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY",
        "SLOWPOKE_INSTALLATION_SIGNING_KID",
    ):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(ValidationError):
        Settings()
