from __future__ import annotations

import logging
from typing import Any, Protocol, cast

from supabase import Client, create_client

from .database_types import (
    PublicInstallations,
    PublicPromptEventsInsert,
    PublicTelemetryBatchesInsert,
)
from .domain import Installation, Partition
from .errors import RepositoryError, UnknownInstallationError

logger = logging.getLogger(__name__)


class IngestionRepository(Protocol):
    def resolve_installation(self, collector_id: str) -> Installation: ...

    def persist(self, partition: Partition, installation: Installation) -> None: ...


class SupabaseRepository:
    def __init__(self, url: str, secret_key: str):
        self._client: Client = create_client(url, secret_key)

    def resolve_installation(self, collector_id: str) -> Installation:
        try:
            response = (
                self._client.table("installations")
                .select("id,organization_id,collector_id,created_at,revoked_at")
                .eq("collector_id", collector_id)
                .is_("revoked_at", "null")
                .limit(1)
                .execute()
            )
            if not response.data:
                raise UnknownInstallationError({collector_id})
            row = PublicInstallations.model_validate(response.data[0])
            return Installation(
                id=row.id,
                organization_id=row.organization_id,
                collector_id=row.collector_id,
            )
        except UnknownInstallationError:
            raise
        except Exception as error:
            logger.exception("Failed to resolve telemetry installation")
            raise RepositoryError("failed to resolve installation") from error

    def persist(self, partition: Partition, installation: Installation) -> None:
        try:
            batch: PublicTelemetryBatchesInsert = {
                "organization_id": installation.organization_id,
                "installation_id": installation.id,
                "signal": partition.signal,
                "content_sha256": partition.content_sha256,
                "raw_payload": cast(Any, partition.payload),
            }
            response = (
                self._client.table("telemetry_batches")
                .upsert(
                    cast(dict[str, Any], batch),
                    on_conflict="installation_id,signal,content_sha256",
                )
                .select("id")
                .execute()
            )
            batch_id = int(cast(dict[str, Any], response.data[0])["id"])

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
                        "prompt_text": prompt.prompt_text,
                        "is_redacted": prompt.is_redacted,
                    }
                )
            serialized_prompt_rows = [
                {
                    **cast(dict[str, Any], row),
                    "occurred_at": cast(dict[str, Any], row)["occurred_at"].isoformat(),
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
