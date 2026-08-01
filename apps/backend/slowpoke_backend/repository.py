from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
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
    def resolve_installations(
        self, collector_ids: set[str]
    ) -> Mapping[str, Installation]: ...

    def persist(
        self,
        partitions: Iterable[Partition],
        installations: Mapping[str, Installation],
    ) -> None: ...


class SupabaseRepository:
    def __init__(self, url: str, secret_key: str):
        self._client: Client = create_client(url, secret_key)

    def resolve_installations(
        self, collector_ids: set[str]
    ) -> Mapping[str, Installation]:
        if not collector_ids:
            return {}
        try:
            response = (
                self._client.table("installations")
                .select("id,organization_id,collector_id,created_at,revoked_at")
                .in_("collector_id", sorted(collector_ids))
                .is_("revoked_at", "null")
                .execute()
            )
            rows = [PublicInstallations.model_validate(row) for row in response.data]
            installations = {
                row.collector_id: Installation(
                    id=row.id,
                    organization_id=row.organization_id,
                    collector_id=row.collector_id,
                )
                for row in rows
            }
        except Exception as error:
            logger.exception("Failed to resolve telemetry installations")
            raise RepositoryError("failed to resolve installations") from error

        unknown = collector_ids - installations.keys()
        if unknown:
            raise UnknownInstallationError(unknown)
        return installations

    def persist(
        self,
        partitions: Iterable[Partition],
        installations: Mapping[str, Installation],
    ) -> None:
        try:
            for partition in partitions:
                installation = installations[partition.installation_id]
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
                    .execute()
                )
                rows = cast(list[dict[str, Any]], response.data)
                if not rows:
                    selected = (
                        self._client.table("telemetry_batches")
                        .select("id")
                        .eq("installation_id", installation.id)
                        .eq("signal", partition.signal)
                        .eq("content_sha256", partition.content_sha256)
                        .limit(1)
                        .execute()
                    )
                    selected_row = cast(dict[str, Any], selected.data[0])
                    batch_id = int(selected_row["id"])
                else:
                    batch_id = int(rows[0]["id"])
                if partition.prompts:
                    prompt_rows: list[PublicPromptEventsInsert] = []
                    for prompt in partition.prompts:
                        prompt_row: PublicPromptEventsInsert = {
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
                            "attributes": cast(Any, prompt.attributes),
                            "resource_attributes": cast(
                                Any, prompt.resource_attributes
                            ),
                        }
                        prompt_rows.append(prompt_row)
                    serialized_prompt_rows = [
                        {
                            **cast(dict[str, Any], row),
                            "occurred_at": cast(dict[str, Any], row)[
                                "occurred_at"
                            ].isoformat(),
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
        except (UnknownInstallationError, RepositoryError):
            raise
        except Exception as error:
            logger.exception("Failed to persist telemetry")
            raise RepositoryError("failed to persist telemetry") from error
