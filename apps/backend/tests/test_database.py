from __future__ import annotations

import json
import os
import secrets
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from supabase import Client, create_client

from slowpoke_backend.app import create_app
from slowpoke_backend.enrollment import SupabaseEnrollmentRepository
from slowpoke_backend.errors import (
    DuplicateTeamInstallationError,
    ExpiredEnrollmentCodeError,
)
from slowpoke_backend.repository import SupabaseRepository
from slowpoke_backend.settings import Settings

from .helpers import (
    TEST_COLLECTOR_AUDIENCE,
    TEST_COLLECTOR_URL,
    TEST_INSTALLATION_ISSUER,
    TEST_SIGNING_KID,
    TEST_SIGNING_PRIVATE_KEY,
    resource_group,
)

pytestmark = pytest.mark.database

LOCAL_USER_ID = "00000000-0000-4000-8000-000000000002"


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
        .insert(
            {
                "name": f"Database test {suffix}",
                "created_by_user_id": LOCAL_USER_ID,
                "idempotency_key": str(uuid4()),
            }
        )
        .execute()
        .data[0]
    )
    organization_id = str(organization["id"])
    setup_session = (
        client.table("installation_setup_sessions")
        .insert(
            {
                "organization_id": organization_id,
                "created_by_user_id": LOCAL_USER_ID,
                "code_digest": secrets.token_hex(32),
                "selected_tools": ["codex"],
                "expires_at": (datetime.now(UTC) + timedelta(minutes=10)).isoformat(),
            }
        )
        .execute()
        .data[0]
    )
    installation = (
        client.table("installations")
        .insert(
            {
                "organization_id": organization_id,
                "created_by_user_id": LOCAL_USER_ID,
                "tool": "codex",
                "computer_name": "Backend database test",
                "setup_session_id": setup_session["id"],
            }
        )
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
        SLOWPOKE_INSTALLATION_ISSUER=TEST_INSTALLATION_ISSUER,
        SLOWPOKE_COLLECTOR_AUDIENCE=TEST_COLLECTOR_AUDIENCE,
        SLOWPOKE_COLLECTOR_URL=TEST_COLLECTOR_URL,
        SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY=TEST_SIGNING_PRIVATE_KEY,
        SLOWPOKE_INSTALLATION_SIGNING_KID=TEST_SIGNING_KID,
    )
    return TestClient(create_app(settings, SupabaseRepository(url, secret_key)))


@contextmanager
def _setup_session_fixture(
    selected_tools: list[str],
    expires_at: datetime,
    *,
    installation_type: str = "personal",
    team_name: str | None = None,
) -> Iterator[tuple[Client, str, str, str]]:
    url, secret_key = _credentials()
    client = create_client(url, secret_key)
    suffix = secrets.token_hex(8)
    organization = (
        client.table("organizations")
        .insert(
            {
                "name": f"Enrollment test {suffix}",
                "created_by_user_id": LOCAL_USER_ID,
                "idempotency_key": str(uuid4()),
            }
        )
        .execute()
        .data[0]
    )
    organization_id = str(organization["id"])
    digest = secrets.token_hex(32)
    setup_session = (
        client.table("installation_setup_sessions")
        .insert(
            {
                "organization_id": organization_id,
                "created_by_user_id": LOCAL_USER_ID,
                "code_digest": digest,
                "selected_tools": selected_tools,
                "expires_at": expires_at.isoformat(),
                "installation_type": installation_type,
                "team_name": team_name,
            }
        )
        .execute()
        .data[0]
    )
    try:
        yield client, organization_id, digest, str(setup_session["id"])
    finally:
        client.table("organizations").delete().eq("id", organization_id).execute()


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
                        model="gpt-5.6-sol",
                        slug="gpt-5.6-sol",
                        originator="Codex_Desktop",
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
            .select("organization_id,installation_id,prompt_text,model,slug,originator")
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
                "model": "gpt-5.6-sol",
                "slug": "gpt-5.6-sol",
                "originator": "Codex_Desktop",
            }
        ]
        timestamps = (
            service_client.table("installations")
            .select("verified_at,last_seen_at")
            .eq("id", installation_id)
            .single()
            .execute()
            .data
        )
        assert timestamps["verified_at"] is not None
        assert timestamps["last_seen_at"] is not None

        assert _post(client, "logs", payloads["logs"], token).status_code == 200
        after_replay = (
            service_client.table("installations")
            .select("verified_at,last_seen_at")
            .eq("id", installation_id)
            .single()
            .execute()
            .data
        )
        assert after_replay["verified_at"] == timestamps["verified_at"]
        assert after_replay["last_seen_at"] >= timestamps["last_seen_at"]


def test_unknown_installation_is_retryable_and_stores_nothing() -> None:
    url, secret_key = _credentials()
    token = secrets.token_urlsafe(24)
    client = _api(secret_key, url, token)
    unknown_id = str(uuid4())
    service_client = create_client(url, secret_key)

    response = _post(
        client,
        "logs",
        {"resourceLogs": [resource_group(unknown_id)]},
        token,
    )

    assert response.status_code == 503
    stored = (
        service_client.table("telemetry_batches")
        .select("id", count="exact")
        .eq("installation_id", unknown_id)
        .execute()
        .count
    )
    assert stored == 0


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


def test_enrollment_redeem_is_idempotent_for_each_selected_tool() -> None:
    url, secret_key = _credentials()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=10)
    with _setup_session_fixture(["codex", "claude_code"], expires_at) as (
        client,
        organization_id,
        digest,
        setup_session_id,
    ):
        repository = SupabaseEnrollmentRepository(url, secret_key)

        first = repository.redeem(digest, "Test laptop", now)
        second = repository.redeem(
            digest, "Ignored retry name", now + timedelta(seconds=1)
        )
        stored = (
            client.table("installations")
            .select("*")
            .eq("setup_session_id", setup_session_id)
            .execute()
            .data
        )

        assert [installation.tool for installation in first] == ["codex", "claude_code"]
        assert [installation.id for installation in second] == [
            installation.id for installation in first
        ]
        assert {installation.organization_id for installation in first} == {
            UUID(organization_id)
        }
        assert len(stored) == 2
        assert {row["computer_name"] for row in stored} == {"Test laptop"}
        assert {row["installation_type"] for row in stored} == {"personal"}
        assert {row["team_name"] for row in stored} == {None}
        assert all("token" not in row for row in stored)


def test_team_enrollment_uses_stored_name_and_rejects_active_duplicate() -> None:
    url, secret_key = _credentials()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=10)
    with _setup_session_fixture(
        ["claude_code"],
        expires_at,
        installation_type="team",
        team_name="Platform",
    ) as (client, organization_id, digest, setup_session_id):
        repository = SupabaseEnrollmentRepository(url, secret_key)

        repository.redeem(digest, "Ignored computer", now)
        stored = (
            client.table("installations")
            .select("id,computer_name,installation_type,team_name")
            .eq("setup_session_id", setup_session_id)
            .single()
            .execute()
            .data
        )
        assert stored["computer_name"] == "Platform"
        assert stored["installation_type"] == "team"
        assert stored["team_name"] == "Platform"

        duplicate_digest = secrets.token_hex(32)
        duplicate_session = (
            client.table("installation_setup_sessions")
            .insert(
                {
                    "organization_id": organization_id,
                    "created_by_user_id": LOCAL_USER_ID,
                    "code_digest": duplicate_digest,
                    "selected_tools": ["claude_code"],
                    "expires_at": expires_at.isoformat(),
                    "installation_type": "team",
                    "team_name": "platform",
                }
            )
            .execute()
            .data[0]
        )
        with pytest.raises(DuplicateTeamInstallationError):
            repository.redeem(duplicate_digest, "Ignored computer", now)

        client.table("installations").update({"revoked_at": now.isoformat()}).eq(
            "id", stored["id"]
        ).execute()
        replacement = repository.redeem(
            duplicate_digest, "Ignored computer", now + timedelta(seconds=1)
        )
        assert len(replacement) == 1
        assert str(replacement[0].id) != stored["id"]
        replacement_row = (
            client.table("installations")
            .select("team_name,revoked_at")
            .eq("setup_session_id", duplicate_session["id"])
            .single()
            .execute()
            .data
        )
        assert replacement_row == {"team_name": "platform", "revoked_at": None}


def test_team_schema_requires_claude_and_a_valid_name() -> None:
    url, secret_key = _credentials()
    client = create_client(url, secret_key)
    suffix = secrets.token_hex(8)
    organization = (
        client.table("organizations")
        .insert(
            {
                "name": f"Team schema test {suffix}",
                "created_by_user_id": LOCAL_USER_ID,
                "idempotency_key": str(uuid4()),
            }
        )
        .execute()
        .data[0]
    )
    organization_id = str(organization["id"])
    expires_at = (datetime.now(UTC) + timedelta(minutes=10)).isoformat()

    def setup_session(**overrides: object) -> dict[str, object]:
        values: dict[str, object] = {
            "organization_id": organization_id,
            "created_by_user_id": LOCAL_USER_ID,
            "code_digest": secrets.token_hex(32),
            "selected_tools": ["claude_code"],
            "expires_at": expires_at,
            "installation_type": "team",
            "team_name": "Platform",
        }
        values.update(overrides)
        return values

    try:
        with pytest.raises(APIError):
            client.table("installation_setup_sessions").insert(
                setup_session(selected_tools=["codex"])
            ).execute()
        with pytest.raises(APIError):
            client.table("installation_setup_sessions").insert(
                setup_session(team_name=None)
            ).execute()
        with pytest.raises(APIError):
            client.table("installation_setup_sessions").insert(
                setup_session(team_name=" Platform ")
            ).execute()
        with pytest.raises(APIError):
            client.table("installation_setup_sessions").insert(
                setup_session(team_name="x" * 81)
            ).execute()
        with pytest.raises(APIError):
            client.table("installation_setup_sessions").insert(
                setup_session(installation_type="personal")
            ).execute()

        valid_setup = (
            client.table("installation_setup_sessions")
            .insert(setup_session())
            .execute()
            .data[0]
        )
        invalid_installation = {
            "organization_id": organization_id,
            "created_by_user_id": LOCAL_USER_ID,
            "tool": "codex",
            "computer_name": "Platform",
            "setup_session_id": valid_setup["id"],
            "installation_type": "team",
            "team_name": "Platform",
        }
        with pytest.raises(APIError):
            client.table("installations").insert(invalid_installation).execute()
        with pytest.raises(APIError):
            client.table("installations").insert(
                {**invalid_installation, "tool": "claude_code", "team_name": None}
            ).execute()
    finally:
        client.table("organizations").delete().eq("id", organization_id).execute()


def test_enrollment_rejects_expired_code() -> None:
    url, secret_key = _credentials()
    now = datetime.now(UTC)
    with _setup_session_fixture(["codex"], now - timedelta(seconds=1)) as (
        _client,
        _organization_id,
        digest,
        _setup_session_id,
    ):
        repository = SupabaseEnrollmentRepository(url, secret_key)

        with pytest.raises(ExpiredEnrollmentCodeError):
            repository.redeem(digest, "Test laptop", now)
