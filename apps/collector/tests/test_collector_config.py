from pathlib import Path

COLLECTOR_CONFIG = Path(__file__).resolve().parents[1] / "otelcol.yaml"


def test_oidc_authentication_stamps_installation_claims() -> None:
    config = COLLECTOR_CONFIG.read_text()

    assert "authenticator: oidc" in config
    assert "issuer_url: ${env:SLOWPOKE_INSTALLATION_ISSUER}" in config
    assert "audience: ${env:SLOWPOKE_COLLECTOR_AUDIENCE}" in config
    assert "from_context: auth.subject" in config
    assert "from_context: auth.claims.tool" in config
    assert "basicauth" not in config
    assert "auth.raw" not in config
