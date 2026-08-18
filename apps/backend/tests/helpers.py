from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from slowpoke_backend.domain import Installation, Partition
from slowpoke_backend.errors import UnknownInstallationError


def attribute(key: str, value: object) -> dict[str, object]:
    if isinstance(value, bool):
        encoded = {"boolValue": value}
    elif isinstance(value, int):
        encoded = {"intValue": str(value)}
    else:
        encoded = {"stringValue": value}
    return {"key": key, "value": encoded}


def resource_group(
    installation_id: UUID | str,
    *,
    prompt_event: str | None = None,
    prompt_text: str | None = None,
    model: str | None = None,
    slug: str | None = None,
    originator: str | None = None,
    service_name: str = "test",
) -> dict[str, object]:
    installation_id = str(installation_id)
    group: dict[str, object] = {
        "resource": {
            "attributes": [
                attribute("slowpoke.installation.id", installation_id),
                attribute("service.name", service_name),
            ]
        },
        "scopeLogs": [],
    }
    if prompt_event is not None:
        record_attributes = [
            attribute("prompt.id", f"prompt-{installation_id}"),
            attribute("session.id", f"session-{installation_id}"),
            attribute("event.timestamp", "2026-07-31T12:00:00Z"),
        ]
        if prompt_text is not None:
            record_attributes.append(attribute("prompt", prompt_text))
        if model is not None:
            record_attributes.append(attribute("model", model))
        if slug is not None:
            record_attributes.append(attribute("slug", slug))
        if originator is not None:
            record_attributes.append(attribute("originator", originator))
        group["scopeLogs"] = [
            {
                "scope": {"name": service_name},
                "logRecords": [
                    {
                        "eventName": prompt_event,
                        "attributes": record_attributes,
                        "timeUnixNano": "1785499200000000000",
                    }
                ],
            }
        ]
    return group


class FakeRepository:
    def __init__(self, known: Mapping[UUID, Installation] | None = None):
        self.known = dict(known or {})
        self.resolve_calls: list[UUID] = []
        self.persist_calls: list[Partition] = []
        self.batch_keys: set[tuple[UUID, str, str]] = set()
        self.prompt_keys: set[tuple[UUID, str, int]] = set()

    def resolve_installation(self, installation_id: UUID) -> Installation:
        self.resolve_calls.append(installation_id)
        if installation_id not in self.known:
            raise UnknownInstallationError({installation_id})
        return self.known[installation_id]

    def persist(
        self,
        partition: Partition,
        installation: Installation,
    ) -> None:
        assert partition.installation_id == installation.id
        self.persist_calls.append(partition)
        key = (
            partition.installation_id,
            partition.signal,
            partition.content_sha256,
        )
        self.batch_keys.add(key)
        for prompt in partition.prompts:
            self.prompt_keys.add(
                (
                    partition.installation_id,
                    partition.content_sha256,
                    prompt.record_index,
                )
            )
