from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from .domain import Partition, Prompt, Provider, Signal
from .errors import InvalidPayloadError

_RESOURCE_FIELD: dict[Signal, str] = {
    "logs": "resourceLogs",
    "metrics": "resourceMetrics",
    "traces": "resourceSpans",
}
_PROMPT_PROVIDERS: dict[str, Provider] = {
    "claude_code.user_prompt": "anthropic",
    "codex.user_prompt": "openai",
}
_PROMPT_ATTRIBUTE_KEYS = frozenset(
    {
        "conversation.id",
        "event.name",
        "event.timestamp",
        "prompt",
        "prompt.id",
        "session.id",
        "user.account_id",
        "user.account_uuid",
        "user.email",
    }
)


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def partition_export(payload: object, signal: Signal) -> tuple[Partition, ...]:
    if not isinstance(payload, dict):
        raise InvalidPayloadError("OTLP export must be a JSON object")

    resource_field = _RESOURCE_FIELD[signal]
    groups = payload.get(resource_field)
    if groups is None:
        raise InvalidPayloadError(f"missing {resource_field}")
    if not isinstance(groups, list):
        raise InvalidPayloadError(f"{resource_field} must be an array")

    grouped: dict[UUID, list[dict[str, object]]] = {}
    for group in groups:
        if not isinstance(group, dict):
            raise InvalidPayloadError("resource groups must be JSON objects")
        installation_id = _installation_id(group)
        grouped.setdefault(installation_id, []).append(cast(dict[str, object], group))

    partitions = []
    for installation_id, tenant_groups in grouped.items():
        partition_payload: dict[str, object] = {resource_field: tenant_groups}
        encoded = canonical_json(partition_payload)
        prompts = _extract_prompts(tenant_groups) if signal == "logs" else ()
        partitions.append(
            Partition(
                installation_id=installation_id,
                signal=signal,
                payload=partition_payload,
                content_sha256=hashlib.sha256(encoded).hexdigest(),
                prompts=prompts,
            )
        )
    return tuple(partitions)


def _installation_id(group: Mapping[str, object]) -> UUID:
    resource = group.get("resource", {})
    if not isinstance(resource, dict):
        raise InvalidPayloadError("resource must be a JSON object")
    attributes = _string_attributes(
        resource.get("attributes", []),
        frozenset({"slowpoke.installation.id"}),
    )
    installation_id = attributes.get("slowpoke.installation.id")
    if installation_id is None or not installation_id.strip():
        raise InvalidPayloadError(
            "every resource group requires slowpoke.installation.id"
        )
    try:
        return UUID(installation_id)
    except ValueError as error:
        raise InvalidPayloadError("slowpoke.installation.id must be a UUID") from error


def _string_attributes(value: object, keys: frozenset[str]) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, list):
        raise InvalidPayloadError("OTLP attributes must be an array")

    strings: dict[str, str] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if not isinstance(key, str) or key not in keys:
            continue
        string = _string_value(item.get("value"))
        if string is not None:
            strings[key] = string
    return strings


def _string_value(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    string = value.get("stringValue")
    return string if isinstance(string, str) else None


def _extract_prompts(
    resource_groups: list[dict[str, object]],
) -> tuple[Prompt, ...]:
    prompts: list[Prompt] = []
    record_index = 0
    for group in resource_groups:
        scope_groups = group.get("scopeLogs", [])
        if not isinstance(scope_groups, list):
            raise InvalidPayloadError("scopeLogs must be an array")
        for scope_group in scope_groups:
            if not isinstance(scope_group, dict):
                raise InvalidPayloadError("scopeLogs entries must be objects")
            records = scope_group.get("logRecords", [])
            if not isinstance(records, list):
                raise InvalidPayloadError("logRecords must be an array")
            for record in records:
                if not isinstance(record, dict):
                    raise InvalidPayloadError("logRecords entries must be objects")
                prompt = _extract_prompt(record, record_index)
                if prompt is not None:
                    prompts.append(prompt)
                record_index += 1
    return tuple(prompts)


def _extract_prompt(
    record: Mapping[str, object],
    record_index: int,
) -> Prompt | None:
    attributes = _string_attributes(
        record.get("attributes", []),
        _PROMPT_ATTRIBUTE_KEYS,
    )
    body = _string_value(record.get("body"))
    candidates = (record.get("eventName"), attributes.get("event.name"), body)
    event_name = next(
        (
            value
            for value in candidates
            if isinstance(value, str) and value in _PROMPT_PROVIDERS
        ),
        None,
    )
    if event_name is None:
        return None

    prompt_value = attributes.get("prompt")
    if prompt_value is None and body is not None and body != event_name:
        prompt_value = body
    is_redacted = prompt_value is None or prompt_value == "<REDACTED>"

    return Prompt(
        record_index=record_index,
        provider=_PROMPT_PROVIDERS[event_name],
        event_name=event_name,
        occurred_at=_event_time(record, attributes),
        prompt_id=attributes.get("prompt.id"),
        session_id=attributes.get("session.id") or attributes.get("conversation.id"),
        actor_account_id=attributes.get("user.account_uuid")
        or attributes.get("user.account_id"),
        actor_email=attributes.get("user.email"),
        prompt_text=prompt_value if prompt_value is not None else "<REDACTED>",
        is_redacted=is_redacted,
    )


def _event_time(
    record: Mapping[str, object], attributes: Mapping[str, str]
) -> datetime:
    value = attributes.get("event.timestamp")
    if value is not None:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
        except ValueError:
            pass

    for key in ("timeUnixNano", "observedTimeUnixNano"):
        raw = record.get(key)
        try:
            return datetime.fromtimestamp(
                int(cast(str | int, raw)) / 1_000_000_000, UTC
            )
        except (TypeError, ValueError, OSError):
            continue
    return datetime.now(UTC)
