from __future__ import annotations

import json
import zlib
from collections.abc import Mapping
from uuid import UUID

from .domain import Signal
from .errors import (
    InvalidPayloadError,
    PayloadTooLargeError,
    RevokedInstallationError,
    UnknownInstallationError,
)
from .otlp import partition_export
from .repository import IngestionRepository


def ingest(
    signal: Signal,
    body: bytes,
    headers: Mapping[str, str],
    repository: IngestionRepository,
    max_decompressed_bytes: int,
) -> None:
    decoded = _decode_body(
        body,
        headers.get("content-encoding"),
        max_decompressed_bytes,
    )
    try:
        payload = json.loads(
            decoded,
            parse_constant=lambda value: (_ for _ in ()).throw(
                ValueError(f"invalid JSON constant: {value}")
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise InvalidPayloadError("request body must be valid UTF-8 JSON") from error

    unknown_installations: set[UUID] = set()
    for partition in partition_export(payload, signal):
        try:
            installation = repository.resolve_installation(partition.installation_id)
        except UnknownInstallationError:
            unknown_installations.add(partition.installation_id)
            continue
        except RevokedInstallationError:
            continue
        if partition.tool != installation.tool:
            raise InvalidPayloadError("installation tool does not match token claims")
        expected_provider = "openai" if installation.tool == "codex" else "anthropic"
        if any(prompt.provider != expected_provider for prompt in partition.prompts):
            raise InvalidPayloadError(
                "telemetry source does not match installation tool"
            )
        if not repository.mark_seen(installation):
            continue
        repository.persist(partition, installation)

    if unknown_installations:
        raise UnknownInstallationError(unknown_installations)


def _decode_body(
    body: bytes,
    content_encoding: str | None,
    max_decompressed_bytes: int,
) -> bytes:
    normalized = content_encoding.lower().strip() if content_encoding else ""
    if normalized not in ("", "identity", "gzip"):
        raise InvalidPayloadError("unsupported content encoding")
    if normalized != "gzip":
        if len(body) > max_decompressed_bytes:
            raise PayloadTooLargeError
        return body

    decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
    try:
        decoded = decompressor.decompress(body, max_decompressed_bytes + 1)
        if len(decoded) > max_decompressed_bytes or decompressor.unconsumed_tail:
            raise PayloadTooLargeError
        decoded += decompressor.flush(max_decompressed_bytes + 1 - len(decoded))
    except zlib.error as error:
        raise InvalidPayloadError("invalid gzip body") from error
    if len(decoded) > max_decompressed_bytes:
        raise PayloadTooLargeError
    if not decompressor.eof or decompressor.unused_data:
        raise InvalidPayloadError("invalid gzip body")
    return decoded
