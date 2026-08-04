from __future__ import annotations

from collections.abc import Mapping

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
    collector_id: str,
    *,
    prompt_event: str | None = None,
    prompt_text: str | None = None,
    service_name: str = "test",
) -> dict[str, object]:
    group: dict[str, object] = {
        "resource": {
            "attributes": [
                attribute("slowpoke.installation.id", collector_id),
                attribute("service.name", service_name),
            ]
        },
        "scopeLogs": [],
    }
    if prompt_event is not None:
        record_attributes = [
            attribute("prompt.id", f"prompt-{collector_id}"),
            attribute("session.id", f"session-{collector_id}"),
            attribute("event.timestamp", "2026-07-31T12:00:00Z"),
        ]
        if prompt_text is not None:
            record_attributes.append(attribute("prompt", prompt_text))
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
    def __init__(self, known: Mapping[str, Installation] | None = None):
        self.known = dict(known or {})
        self.resolve_calls: list[str] = []
        self.persist_calls: list[Partition] = []
        self.batch_keys: set[tuple[str, str, str]] = set()
        self.prompt_keys: set[tuple[str, str, int]] = set()

    def resolve_installation(self, collector_id: str) -> Installation:
        self.resolve_calls.append(collector_id)
        if collector_id not in self.known:
            raise UnknownInstallationError({collector_id})
        return self.known[collector_id]

    def persist(
        self,
        partition: Partition,
        installation: Installation,
    ) -> None:
        assert partition.installation_id == installation.collector_id
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
