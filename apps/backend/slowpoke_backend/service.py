from __future__ import annotations

import json
import zlib
from collections.abc import Mapping

from .domain import Signal
from .errors import InvalidPayloadError, PayloadTooLargeError
from .otlp import partition_export
from .repository import IngestionRepository


class IngestionService:
    def __init__(self, repository: IngestionRepository, max_decompressed_bytes: int):
        self._repository = repository
        self._max_decompressed_bytes = max_decompressed_bytes

    def ingest(
        self,
        signal: Signal,
        body: bytes,
        headers: Mapping[str, str],
    ) -> None:
        decoded = self._decode_body(body, headers.get("content-encoding"))
        try:
            payload = json.loads(
                decoded,
                parse_constant=lambda value: (_ for _ in ()).throw(
                    ValueError(f"invalid JSON constant: {value}")
                ),
            )
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            raise InvalidPayloadError(
                "request body must be valid UTF-8 JSON"
            ) from error

        partitions = partition_export(payload, signal)
        collector_ids = {partition.installation_id for partition in partitions}
        installations = self._repository.resolve_installations(collector_ids)
        self._repository.persist(partitions, installations)

    def _decode_body(self, body: bytes, content_encoding: str | None) -> bytes:
        normalized = content_encoding.lower().strip() if content_encoding else ""
        if normalized not in ("", "identity", "gzip"):
            raise InvalidPayloadError("unsupported content encoding")
        if normalized != "gzip":
            if len(body) > self._max_decompressed_bytes:
                raise PayloadTooLargeError
            return body

        decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
        try:
            decoded = decompressor.decompress(body, self._max_decompressed_bytes + 1)
            if (
                len(decoded) > self._max_decompressed_bytes
                or decompressor.unconsumed_tail
            ):
                raise PayloadTooLargeError
            decoded += decompressor.flush(
                self._max_decompressed_bytes + 1 - len(decoded)
            )
        except zlib.error as error:
            raise InvalidPayloadError("invalid gzip body") from error
        if len(decoded) > self._max_decompressed_bytes:
            raise PayloadTooLargeError
        if not decompressor.eof or decompressor.unused_data:
            raise InvalidPayloadError("invalid gzip body")
        return decoded
