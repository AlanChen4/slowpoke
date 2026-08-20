from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, Protocol, cast
from uuid import UUID

from supabase import Client, create_client

from .database_types import (
    PublicInstallations,
    PublicPromptEventsInsert,
    PublicTelemetryBatchesInsert,
)
from .domain import Installation, Partition, Tool
from .errors import RepositoryError, RevokedInstallationError, UnknownInstallationError

logger = logging.getLogger(__name__)


class IngestionRepository(Protocol):
    def resolve_installation(self, installation_id: UUID) -> Installation: ...

    def mark_seen(self, installation: Installation) -> bool: ...

    def persist(self, partition: Partition, installation: Installation) -> None: ...


class SupabaseRepository:
    def __init__(self, url: str, secret_key: str):
        self._client: Client = create_client(url, secret_key)

    def resolve_installation(self, installation_id: UUID) -> Installation:
        try:
            response = (
                self._client.table("installations")
                .select(
                    "id,organization_id,created_at,revoked_at,created_by_user_id,"
                    "tool,computer_name,setup_session_id,verified_at,last_seen_at,"
                    "installation_type,team_name"
                )
                .eq("id", str(installation_id))
                .limit(1)
                .execute()
            )
            if not response.data:
                raise UnknownInstallationError({installation_id})
            row = PublicInstallations.model_validate(response.data[0])
            if row.revoked_at is not None:
                raise RevokedInstallationError
            return Installation(
                id=row.id,
                organization_id=row.organization_id,
                tool=cast(Tool, row.tool),
            )
        except (RevokedInstallationError, UnknownInstallationError):
            raise
        except Exception as error:
            logger.exception("Failed to resolve telemetry installation")
            raise RepositoryError("failed to resolve installation") from error

    def mark_seen(self, installation: Installation) -> bool:
        timestamp = datetime.now(UTC).isoformat()
        try:
            (
                self._client.table("installations")
                .update({"verified_at": timestamp})
                .eq("id", str(installation.id))
                .is_("verified_at", "null")
                .is_("revoked_at", "null")
                .execute()
            )
            response = (
                self._client.table("installations")
                .update({"last_seen_at": timestamp})
                .eq("id", str(installation.id))
                .is_("revoked_at", "null")
                .select("id")
                .execute()
            )
            return bool(response.data)
        except Exception as error:
            logger.exception("Failed to update installation verification timestamps")
            raise RepositoryError("failed to update installation timestamps") from error

    def persist(self, partition: Partition, installation: Installation) -> None:
        try:
            batch: PublicTelemetryBatchesInsert = {
                "organization_id": installation.organization_id,
                "installation_id": installation.id,
                "signal": partition.signal,
                "content_sha256": partition.content_sha256,
                "raw_payload": cast(Any, partition.payload),
            }
            serialized_batch = {
                **cast(dict[str, Any], batch),
                "organization_id": str(batch["organization_id"]),
                "installation_id": str(batch["installation_id"]),
            }
            response = (
                self._client.table("telemetry_batches")
                .upsert(
                    serialized_batch,
                    on_conflict="installation_id,signal,content_sha256",
                )
                .select("id")
                .execute()
            )
            batch_id = UUID(str(cast(dict[str, Any], response.data[0])["id"]))

            if not partition.prompts:
                return
            prompt_rows: list[PublicPromptEventsInsert] = []
            for prompt in partition.prompts:
                prompt_rows.append(
                    {
                        "organization_id": installation.organization_id,
                        "installation_id": installation.id,
                        "batch_id": batch_id,
                        "record_index": prompt.record_index,
                        "provider": prompt.provider,
                        "event_name": prompt.event_name,
                        "occurred_at": prompt.occurred_at,
                        "prompt_id": prompt.prompt_id,
                        "session_id": prompt.session_id,
                        "actor_account_id": prompt.actor_account_id,
                        "actor_email": prompt.actor_email,
                        "model": prompt.model,
                        "slug": prompt.slug,
                        "originator": prompt.originator,
                        "prompt_text": prompt.prompt_text,
                        "is_redacted": prompt.is_redacted,
                    }
                )
            serialized_prompt_rows = [
                {
                    **cast(dict[str, Any], row),
                    "occurred_at": cast(dict[str, Any], row)["occurred_at"].isoformat(),
                    "organization_id": str(row["organization_id"]),
                    "installation_id": str(row["installation_id"]),
                    "batch_id": str(row["batch_id"]),
                }
                for row in prompt_rows
            ]
            (
                self._client.table("prompt_events")
                .upsert(
                    serialized_prompt_rows,
                    on_conflict="batch_id,record_index",
                )
                .execute()
            )
        except Exception as error:
            logger.exception("Failed to persist telemetry")
            raise RepositoryError("failed to persist telemetry") from error
