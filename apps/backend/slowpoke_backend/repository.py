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
                    "installation_type,setup_package_version"
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
                if partition.tool == "claude_code" and partition.signal == "logs":
                    self._fill_prompt_models(installation, batch_id)
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
                    # A replay must not erase models recovered after ingestion.
                    ignore_duplicates=True,
                )
                .execute()
            )
            if partition.tool == "claude_code":
                self._fill_prompt_models(installation, batch_id)
                # API events can arrive before their user_prompt event.
                prompt_ids = [
                    prompt.prompt_id
                    for prompt in partition.prompts
                    if prompt.model is None and prompt.prompt_id
                ]
                if prompt_ids:
                    self._fill_prompt_models(
                        installation, batch_id, prompt_ids=prompt_ids
                    )
        except Exception as error:
            logger.exception("Failed to persist telemetry")
            raise RepositoryError("failed to persist telemetry") from error

    def _fill_prompt_models(
        self,
        installation: Installation,
        batch_id: UUID,
        *,
        prompt_ids: list[str] | None = None,
    ) -> None:
        """Resolve models for a batch, using errors only until a success arrives."""
        offset = 0
        seen: set[tuple[str, str]] = set()
        while True:
            query = (
                self._client.table("response_usage_events")
                .select("prompt_id,conversation_id,model,is_error")
                .eq("organization_id", str(installation.organization_id))
                .eq("installation_id", str(installation.id))
                .eq("provider", "anthropic")
                .neq("model", "")
                .order("is_error")
                .order("event_timestamp")
                .order("prompt_id")
                .order("model")
            )
            if prompt_ids is None:
                query = query.eq("batch_id", str(batch_id))
            else:
                query = query.in_("prompt_id", prompt_ids)
            rows = cast(
                list[dict[str, Any]],
                query.range(offset, offset + 999).execute().data,
            )
            for row in rows:
                prompt_id, session_id = row["prompt_id"], row["conversation_id"]
                model = (row["model"] or "").strip()
                if not prompt_id or not session_id or not model:
                    continue
                key = (prompt_id, session_id)
                if key in seen:
                    continue
                seen.add(key)
                is_error = row["is_error"]
                update = (
                    self._client.table("prompt_events")
                    .update({"model": model, "model_is_fallback": is_error})
                    .eq("organization_id", str(installation.organization_id))
                    .eq("installation_id", str(installation.id))
                    .eq("provider", "anthropic")
                    .eq("prompt_id", prompt_id)
                    .eq("session_id", session_id)
                )
                if is_error:
                    update = update.is_("model", "null")
                else:
                    # A success can replace an attempted model, including on retry.
                    update = update.or_("model.is.null,model_is_fallback.eq.true")
                update.select("id").execute()
            if len(rows) < 1000:
                return
            offset += len(rows)
