from __future__ import annotations

import json
import os
import secrets
from collections.abc import Iterator
from contextlib import contextmanager
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from supabase import Client, create_client

from slowpoke_backend.app import create_app
from slowpoke_backend.repository import SupabaseRepository
from slowpoke_backend.settings import Settings

from .helpers import resource_group

pytestmark = pytest.mark.database


def _credentials() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret_key:
        pytest.skip("SUPABASE_URL and SUPABASE_SECRET_KEY are required")
    return url, secret_key


@contextmanager
def _database_fixture() -> Iterator[tuple[Client, str, str]]:
    url, secret_key = _credentials()
    client = create_client(url, secret_key)
    suffix = secrets.token_hex(8)
    organization = (
        client.table("organizations")
        .insert({"name": f"Database test {suffix}"})
        .execute()
        .data[0]
    )
    organization_id = str(organization["id"])
    installation = (
        client.table("installations")
        .insert({"organization_id": organization_id})
        .execute()
        .data[0]
    )
    installation_id = str(installation["id"])
    try:
        yield client, organization_id, installation_id
    finally:
        client.table("organizations").delete().eq("id", organization_id).execute()


def _api(secret_key: str, url: str, collector_token: str) -> TestClient:
    settings = Settings(
        SLOWPOKE_INGEST_TOKEN=collector_token,
        SUPABASE_URL=url,
        SUPABASE_SECRET_KEY=secret_key,
    )
    return TestClient(create_app(settings, SupabaseRepository(url, secret_key)))


def _post(client: TestClient, signal: str, payload: object, token: str):
    return client.post(
        f"/api/internal/telemetry/v1/{signal}",
        content=json.dumps(payload),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )


def test_real_repository_stores_all_signals_and_deduplicates_replay() -> None:
    url, secret_key = _credentials()
    token = secrets.token_urlsafe(24)
    with _database_fixture() as (
        service_client,
        organization_id,
        installation_id,
    ):
        client = _api(secret_key, url, token)
        payloads = {
            "logs": {
                "resourceLogs": [
                    resource_group(
                        installation_id,
                        prompt_event="codex.user_prompt",
                        prompt_text="database prompt",
                    )
                ]
            },
            "metrics": {"resourceMetrics": [resource_group(installation_id)]},
            "traces": {"resourceSpans": [resource_group(installation_id)]},
        }

        for signal, payload in payloads.items():
            assert _post(client, signal, payload, token).status_code == 200
            assert _post(client, signal, payload, token).status_code == 200

        batches = (
            service_client.table("telemetry_batches")
            .select("organization_id,installation_id,signal")
            .eq("organization_id", organization_id)
            .execute()
            .data
        )
        prompts = (
            service_client.table("prompt_events")
            .select("organization_id,installation_id,prompt_text")
            .eq("organization_id", organization_id)
            .execute()
            .data
        )

        assert {row["signal"] for row in batches} == {"logs", "metrics", "traces"}
        assert len(batches) == 3
        assert {
            (row["organization_id"], row["installation_id"]) for row in batches
        } == {(organization_id, installation_id)}
        assert prompts == [
            {
                "organization_id": organization_id,
                "installation_id": installation_id,
                "prompt_text": "database prompt",
            }
        ]


def test_unknown_installation_is_retryable_and_stores_nothing() -> None:
    url, secret_key = _credentials()
    token = secrets.token_urlsafe(24)
    client = _api(secret_key, url, token)
    unknown_id = str(uuid4())
    service_client = create_client(url, secret_key)
    before = (
        service_client.table("telemetry_batches")
        .select("id", count="exact")
        .execute()
        .count
    )

    response = _post(
        client,
        "logs",
        {"resourceLogs": [resource_group(unknown_id)]},
        token,
    )

    assert response.status_code == 503
    after = (
        service_client.table("telemetry_batches")
        .select("id", count="exact")
        .execute()
        .count
    )
    assert after == before


def test_mixed_export_persists_known_partition_before_retry() -> None:
    url, secret_key = _credentials()
    token = secrets.token_urlsafe(24)
    with _database_fixture() as (
        service_client,
        organization_id,
        installation_id,
    ):
        client = _api(secret_key, url, token)
        response = _post(
            client,
            "logs",
            {
                "resourceLogs": [
                    resource_group(installation_id),
                    resource_group(uuid4()),
                ]
            },
            token,
        )

        assert response.status_code == 503
        batches = (
            service_client.table("telemetry_batches")
            .select("organization_id,installation_id")
            .eq("organization_id", organization_id)
            .execute()
            .data
        )
        assert batches == [
            {
                "organization_id": organization_id,
                "installation_id": installation_id,
            }
        ]
