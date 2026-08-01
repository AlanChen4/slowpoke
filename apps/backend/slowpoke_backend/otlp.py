from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import cast

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

    grouped: dict[str, list[dict[str, object]]] = {}
    for group in groups:
        if not isinstance(group, dict):
            raise InvalidPayloadError("resource groups must be JSON objects")
        resource_attributes = _resource_attributes(group)
        collector_id = resource_attributes.get("slowpoke.installation.id")
        if not isinstance(collector_id, str) or not collector_id.strip():
            raise InvalidPayloadError(
                "every resource group requires slowpoke.installation.id"
            )
        grouped.setdefault(collector_id, []).append(cast(dict[str, object], group))

    partitions = []
    for collector_id, tenant_groups in grouped.items():
        partition_payload: dict[str, object] = {resource_field: tenant_groups}
        encoded = canonical_json(partition_payload)
        prompts = _extract_prompts(tenant_groups) if signal == "logs" else ()
        partitions.append(
            Partition(
                installation_id=collector_id,
                signal=signal,
                payload=partition_payload,
                content_sha256=hashlib.sha256(encoded).hexdigest(),
                prompts=prompts,
            )
        )
    return tuple(partitions)


def _resource_attributes(group: Mapping[str, object]) -> dict[str, object]:
    resource = group.get("resource", {})
    if not isinstance(resource, dict):
        raise InvalidPayloadError("resource must be a JSON object")
    return _attributes(resource.get("attributes", []))


def _attributes(value: object) -> dict[str, object]:
    if value is None:
        return {}
    if not isinstance(value, list):
        raise InvalidPayloadError("OTLP attributes must be an array")

    decoded: dict[str, object] = {}
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("key"), str):
            raise InvalidPayloadError("OTLP attributes require string keys")
        decoded[cast(str, item["key"])] = _any_value(item.get("value"))
    return decoded


def _any_value(value: object) -> object:
    if not isinstance(value, dict):
        raise InvalidPayloadError("OTLP attribute values must be JSON objects")
    variants = (
        "stringValue",
        "boolValue",
        "intValue",
        "doubleValue",
        "bytesValue",
    )
    for key in variants:
        if key in value:
            return value[key]
    if "arrayValue" in value:
        array = value["arrayValue"]
        if not isinstance(array, dict) or not isinstance(array.get("values", []), list):
            raise InvalidPayloadError("invalid OTLP array value")
        return [
            _any_value(item) for item in cast(list[object], array.get("values", []))
        ]
    if "kvlistValue" in value:
        key_values = value["kvlistValue"]
        if not isinstance(key_values, dict):
            raise InvalidPayloadError("invalid OTLP key-value list")
        return _attributes(key_values.get("values", []))
    if not value:
        return None
    raise InvalidPayloadError("unsupported OTLP attribute value")


def _extract_prompts(
    resource_groups: list[dict[str, object]],
) -> tuple[Prompt, ...]:
    prompts: list[Prompt] = []
    record_index = 0
    for group in resource_groups:
        resource_attributes = _resource_attributes(group)
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
                prompt = _extract_prompt(record, resource_attributes, record_index)
                if prompt is not None:
                    prompts.append(prompt)
                record_index += 1
    return tuple(prompts)


def _extract_prompt(
    record: Mapping[str, object],
    resource_attributes: dict[str, object],
    record_index: int,
) -> Prompt | None:
    attributes = _attributes(record.get("attributes", []))
    body = _optional_any_value(record.get("body"))
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
    if prompt_value is None and isinstance(body, str) and body != event_name:
        prompt_value = body
    is_redacted = not isinstance(prompt_value, str) or prompt_value == "<REDACTED>"
    prompt_text = prompt_value if isinstance(prompt_value, str) else "<REDACTED>"

    return Prompt(
        record_index=record_index,
        provider=_PROMPT_PROVIDERS[event_name],
        event_name=event_name,
        occurred_at=_event_time(record, attributes),
        prompt_id=_text_attribute(attributes, "prompt.id"),
        session_id=(
            _text_attribute(attributes, "session.id")
            or _text_attribute(attributes, "conversation.id")
        ),
        actor_account_id=(
            _text_attribute(attributes, "user.account_uuid")
            or _text_attribute(attributes, "user.account_id")
        ),
        actor_email=_text_attribute(attributes, "user.email"),
        prompt_text=prompt_text,
        is_redacted=is_redacted,
        attributes=attributes,
        resource_attributes=resource_attributes,
    )


def _optional_any_value(value: object) -> object:
    return None if value is None else _any_value(value)


def _text_attribute(attributes: Mapping[str, object], key: str) -> str | None:
    value = attributes.get(key)
    return value if isinstance(value, str) else None


def _event_time(
    record: Mapping[str, object], attributes: Mapping[str, object]
) -> datetime:
    value = attributes.get("event.timestamp")
    if isinstance(value, str):
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
