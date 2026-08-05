from __future__ import annotations

import gzip
import json

from fastapi.testclient import TestClient

from slowpoke_backend.app import create_app
from slowpoke_backend.domain import Installation
from slowpoke_backend.errors import RepositoryError
from slowpoke_backend.settings import Settings

from .helpers import FakeRepository, attribute, resource_group

TOKEN = "test-ingest-token"
SETTINGS = Settings(
    ingest_token=TOKEN,
    supabase_url="http://unused.invalid",
    supabase_secret_key="unused",
    max_decompressed_bytes=512,
)


def _client(repository: FakeRepository) -> TestClient:
    return TestClient(create_app(SETTINGS, repository))


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


def test_accepts_gzipped_otlp_json() -> None:
    installation = Installation(1, 10, "known")
    repository = FakeRepository({"known": installation})

    response = _post(
        _client(repository),
        {"resourceLogs": [resource_group("known")]},
        gzip_body=True,
    )

    assert response.status_code == 200
    assert response.json() == {}
    assert repository.resolve_calls == ["known"]
    assert len(repository.persist_calls) == 1


def test_rejects_malformed_and_oversized_payloads() -> None:
    client = _client(FakeRepository())

    malformed = client.post(
        "/api/internal/telemetry/v1/logs",
        content=b"not-json",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    oversized = client.post(
        "/api/internal/telemetry/v1/logs",
        content=b"{" + b" " * 513,
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
        content=gzip.compress(b"{" + b" " * 513),
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

    assert missing_signal_export.status_code == 400
    assert unstamped_resource.status_code == 400


def test_persists_known_groups_before_retrying_unknown_installation() -> None:
    repository = FakeRepository(
        {
            "known-a": Installation(1, 10, "known-a"),
            "known-c": Installation(2, 20, "known-c"),
        }
    )
    payload = {
        "resourceLogs": [
            {
                "resource": {
                    "attributes": [attribute("slowpoke.installation.id", collector_id)]
                }
            }
            for collector_id in ("known-a", "unknown", "known-c")
        ]
    }

    response = _post(_client(repository), payload)

    assert response.status_code == 503
    assert response.headers["retry-after"] == "30"
    assert repository.resolve_calls == ["known-a", "unknown", "known-c"]
    assert [item.installation_id for item in repository.persist_calls] == [
        "known-a",
        "known-c",
    ]


def test_database_failure_is_retryable() -> None:
    class FailingRepository(FakeRepository):
        def resolve_installation(self, collector_id: str):
            raise RepositoryError("database unavailable")

    response = _post(
        _client(FailingRepository()),
        {"resourceLogs": [resource_group("known")]},
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"


def test_unknown_signal_is_not_found() -> None:
    response = _post(_client(FakeRepository()), {}, signal="profiles")
    assert response.status_code == 404
