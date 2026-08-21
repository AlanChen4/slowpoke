from __future__ import annotations

import gzip
import hashlib
import json
from datetime import datetime
from uuid import UUID

import jwt
import pytest
from fastapi.testclient import TestClient

from slowpoke_backend.app import create_app
from slowpoke_backend.domain import Installation
from slowpoke_backend.errors import (
    DuplicateTeamInstallationError,
    ExpiredEnrollmentCodeError,
    InvalidEnrollmentCodeError,
    RepositoryError,
    RevokedInstallationError,
)
from slowpoke_backend.settings import Settings
from slowpoke_backend.signing import InstallationTokenIssuer

from .helpers import (
    TEST_COLLECTOR_AUDIENCE,
    TEST_COLLECTOR_URL,
    TEST_INSTALLATION_ISSUER,
    TEST_SIGNING_KID,
    TEST_SIGNING_PRIVATE_KEY,
    FakeRepository,
    attribute,
    new_signing_private_key,
    resource_group,
)

TOKEN = "test-ingest-token"
SETTINGS = Settings(
    SLOWPOKE_INGEST_TOKEN=TOKEN,
    SUPABASE_URL="http://unused.invalid",
    SUPABASE_SECRET_KEY="unused",
    SLOWPOKE_INSTALLATION_ISSUER=TEST_INSTALLATION_ISSUER,
    SLOWPOKE_COLLECTOR_AUDIENCE=TEST_COLLECTOR_AUDIENCE,
    SLOWPOKE_COLLECTOR_URL=TEST_COLLECTOR_URL,
    SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY=TEST_SIGNING_PRIVATE_KEY,
    SLOWPOKE_INSTALLATION_SIGNING_KID=TEST_SIGNING_KID,
    SLOWPOKE_MAX_DECOMPRESSED_BYTES=1024,
)
KNOWN = UUID("00000000-0000-4000-8000-000000000001")
KNOWN_A = UUID("00000000-0000-4000-8000-000000000002")
UNKNOWN = UUID("00000000-0000-4000-8000-000000000003")
KNOWN_C = UUID("00000000-0000-4000-8000-000000000004")
ORGANIZATION_A = UUID("10000000-0000-4000-8000-000000000001")
ORGANIZATION_C = UUID("10000000-0000-4000-8000-000000000002")


class FakeEnrollmentRepository:
    def __init__(
        self,
        installations: tuple[Installation, ...] = (),
        error: Exception | None = None,
    ):
        self.installations = installations
        self.error = error
        self.calls: list[tuple[str, str, datetime, str | None]] = []

    def redeem(
        self,
        code_digest: str,
        computer_name: str,
        now: datetime,
        setup_package_version: str | None = None,
    ):
        self.calls.append((code_digest, computer_name, now, setup_package_version))
        if self.error:
            raise self.error
        return self.installations


def _client(
    repository: FakeRepository,
    enrollment_repository: FakeEnrollmentRepository | None = None,
) -> TestClient:
    return TestClient(
        create_app(
            SETTINGS,
            repository,
            enrollment_repository or FakeEnrollmentRepository(),
        )
    )


def _post(
    client: TestClient,
    payload: object,
    *,
    signal: str = "logs",
    token: str | None = TOKEN,
    gzip_body: bool = False,
):
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if gzip_body:
        body = gzip.compress(body)
        headers["Content-Encoding"] = "gzip"
    return client.post(
        f"/api/internal/telemetry/v1/{signal}", content=body, headers=headers
    )


def test_requires_exact_bearer_token() -> None:
    repository = FakeRepository()
    client = _client(repository)

    assert _post(client, {"resourceLogs": []}, token=None).status_code == 401
    assert _post(client, {"resourceLogs": []}, token="wrong").status_code == 401
    assert repository.resolve_calls == []


def test_publishes_oidc_discovery_and_public_jwks() -> None:
    client = _client(FakeRepository())

    discovery = client.get("/.well-known/openid-configuration")
    jwks = client.get("/.well-known/jwks.json")

    assert discovery.status_code == 200
    assert discovery.json()["issuer"] == TEST_INSTALLATION_ISSUER
    assert discovery.json()["jwks_uri"] == (
        f"{TEST_INSTALLATION_ISSUER}/.well-known/jwks.json"
    )
    assert jwks.status_code == 200
    assert jwks.json()["keys"][0]["kid"] == TEST_SIGNING_KID
    assert jwks.json()["keys"][0]["alg"] == "RS256"
    assert "d" not in jwks.json()["keys"][0]


def test_enrolls_each_tool_with_signed_installation_claims() -> None:
    installations = (
        Installation(KNOWN, ORGANIZATION_A, "codex"),
        Installation(KNOWN_A, ORGANIZATION_A, "claude_code"),
    )
    enrollment_repository = FakeEnrollmentRepository(installations)
    client = _client(FakeRepository(), enrollment_repository)
    code = "short-lived-enrollment-code"

    response = client.post(
        "/api/setup/enroll",
        json={
            "code": code,
            "computer_name": "Ada's laptop",
            "setup_package_version": "0.1.2",
        },
    )

    assert response.status_code == 200
    assert (
        enrollment_repository.calls[0][0] == hashlib.sha256(code.encode()).hexdigest()
    )
    assert enrollment_repository.calls[0][1] == "Ada's laptop"
    assert enrollment_repository.calls[0][3] == "0.1.2"
    assert [item["installation_id"] for item in response.json()["installations"]] == [
        str(KNOWN),
        str(KNOWN_A),
    ]
    assert response.json()["collector_url"] == TEST_COLLECTOR_URL

    public_key = jwt.PyJWK.from_dict(
        client.get("/.well-known/jwks.json").json()["keys"][0]
    ).key
    for expected, item in zip(
        installations, response.json()["installations"], strict=True
    ):
        claims = jwt.decode(
            item["token"],
            public_key,
            algorithms=["RS256"],
            audience=TEST_COLLECTOR_AUDIENCE,
            issuer=TEST_INSTALLATION_ISSUER,
        )
        assert claims["sub"] == str(expected.id)
        assert claims["organization_id"] == str(expected.organization_id)
        assert claims["tool"] == expected.tool
        assert claims["exp"] - claims["iat"] >= 19 * 365 * 24 * 60 * 60
        assert jwt.get_unverified_header(item["token"])["kid"] == TEST_SIGNING_KID


def test_enrollment_errors_are_statused_and_redacted() -> None:
    raw_code = "do-not-echo-this-code"
    for error, status_code in (
        (InvalidEnrollmentCodeError(), 400),
        (ExpiredEnrollmentCodeError(), 410),
        (DuplicateTeamInstallationError(), 409),
        (RepositoryError("database unavailable"), 503),
    ):
        response = _client(
            FakeRepository(), FakeEnrollmentRepository(error=error)
        ).post(
            "/api/setup/enroll",
            json={"code": raw_code, "computer_name": "Test laptop"},
        )

        assert response.status_code == status_code
        assert raw_code not in response.text


def test_installation_token_rejects_another_signing_key() -> None:
    issuer = InstallationTokenIssuer(
        TEST_SIGNING_PRIVATE_KEY,
        TEST_SIGNING_KID,
        TEST_INSTALLATION_ISSUER,
        TEST_COLLECTOR_AUDIENCE,
    )
    token = issuer.issue(Installation(KNOWN, ORGANIZATION_A, "codex"))
    unrelated_issuer = InstallationTokenIssuer(
        new_signing_private_key(),
        "unrelated-key-id",
        TEST_INSTALLATION_ISSUER,
        TEST_COLLECTOR_AUDIENCE,
    )
    unrelated_jwk = unrelated_issuer.jwks()["keys"][0]

    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(
            token,
            jwt.PyJWK.from_dict(unrelated_jwk).key,
            algorithms=["RS256"],
            audience=TEST_COLLECTOR_AUDIENCE,
            issuer=TEST_INSTALLATION_ISSUER,
        )


def test_accepts_gzipped_otlp_json() -> None:
    installation = Installation(KNOWN, ORGANIZATION_A)
    repository = FakeRepository({KNOWN: installation})

    response = _post(
        _client(repository),
        {"resourceLogs": [resource_group(KNOWN)]},
        gzip_body=True,
    )

    assert response.status_code == 200
    assert response.json() == {}
    assert repository.resolve_calls == [KNOWN]
    assert repository.mark_seen_calls == [KNOWN]
    assert len(repository.persist_calls) == 1


def test_rejects_installation_and_prompt_tool_mismatches() -> None:
    codex_repository = FakeRepository(
        {KNOWN: Installation(KNOWN, ORGANIZATION_A, "codex")}
    )
    claim_mismatch = _post(
        _client(codex_repository),
        {"resourceLogs": [resource_group(KNOWN, tool="claude_code")]},
    )
    claude_repository = FakeRepository(
        {KNOWN: Installation(KNOWN, ORGANIZATION_A, "claude_code")}
    )
    prompt_mismatch = _post(
        _client(claude_repository),
        {
            "resourceLogs": [
                {
                    "resource": {
                        "attributes": [
                            attribute("slowpoke.installation.id", str(KNOWN)),
                            attribute("slowpoke.installation.tool", "claude_code"),
                        ]
                    },
                    "scopeLogs": [{"logRecords": [{"eventName": "codex.user_prompt"}]}],
                }
            ]
        },
    )

    assert claim_mismatch.status_code == 400
    assert prompt_mismatch.status_code == 400
    assert codex_repository.persist_calls == []
    assert claude_repository.persist_calls == []


def test_discards_revoked_or_concurrently_revoked_installations() -> None:
    class RevokedRepository(FakeRepository):
        def resolve_installation(self, installation_id: UUID):
            raise RevokedInstallationError

    class ConcurrentlyRevokedRepository(FakeRepository):
        def mark_seen(self, installation: Installation) -> bool:
            return False

    revoked = RevokedRepository()
    concurrent = ConcurrentlyRevokedRepository(
        {KNOWN: Installation(KNOWN, ORGANIZATION_A, "codex")}
    )

    revoked_response = _post(
        _client(revoked), {"resourceLogs": [resource_group(KNOWN)]}
    )
    concurrent_response = _post(
        _client(concurrent), {"resourceLogs": [resource_group(KNOWN)]}
    )

    assert revoked_response.status_code == 200
    assert concurrent_response.status_code == 200
    assert revoked.persist_calls == []
    assert concurrent.persist_calls == []


def test_rejects_malformed_and_oversized_payloads() -> None:
    client = _client(FakeRepository())

    malformed = client.post(
        "/api/internal/telemetry/v1/logs",
        content=b"not-json",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    oversized = client.post(
        "/api/internal/telemetry/v1/logs",
        content=b"{" + b" " * 1025,
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    invalid_gzip = client.post(
        "/api/internal/telemetry/v1/logs",
        content=b"not-gzip",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Encoding": "gzip",
        },
    )
    compressed_oversized = client.post(
        "/api/internal/telemetry/v1/logs",
        content=gzip.compress(b"{" + b" " * 1025),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Encoding": "gzip",
        },
    )

    assert malformed.status_code == 400
    assert oversized.status_code == 413
    assert invalid_gzip.status_code == 400
    assert compressed_oversized.status_code == 413


def test_rejects_structurally_invalid_otlp() -> None:
    client = _client(FakeRepository())

    missing_signal_export = _post(client, {"notResourceLogs": []})
    unstamped_resource = _post(
        client,
        {"resourceLogs": [{"resource": {"attributes": []}, "scopeLogs": []}]},
    )
    malformed_installation_id = _post(
        client,
        {"resourceLogs": [resource_group("not-a-uuid")]},
    )

    assert missing_signal_export.status_code == 400
    assert unstamped_resource.status_code == 400
    assert malformed_installation_id.status_code == 400


def test_persists_known_groups_before_retrying_unknown_installation() -> None:
    repository = FakeRepository(
        {
            KNOWN_A: Installation(KNOWN_A, ORGANIZATION_A),
            KNOWN_C: Installation(KNOWN_C, ORGANIZATION_C),
        }
    )
    payload = {
        "resourceLogs": [
            {
                "resource": {
                    "attributes": [
                        attribute("slowpoke.installation.id", str(installation_id)),
                        attribute("slowpoke.installation.tool", "codex"),
                    ]
                }
            }
            for installation_id in (KNOWN_A, UNKNOWN, KNOWN_C)
        ]
    }

    response = _post(_client(repository), payload)

    assert response.status_code == 503
    assert response.headers["retry-after"] == "30"
    assert repository.resolve_calls == [KNOWN_A, UNKNOWN, KNOWN_C]
    assert [item.installation_id for item in repository.persist_calls] == [
        KNOWN_A,
        KNOWN_C,
    ]


def test_database_failure_is_retryable() -> None:
    class FailingRepository(FakeRepository):
        def resolve_installation(self, installation_id: UUID):
            raise RepositoryError("database unavailable")

    response = _post(
        _client(FailingRepository()),
        {"resourceLogs": [resource_group(KNOWN)]},
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"


def test_unknown_signal_is_not_found() -> None:
    response = _post(_client(FakeRepository()), {}, signal="profiles")
    assert response.status_code == 404
