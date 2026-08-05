from __future__ import annotations

import json

from slowpoke_backend.domain import Installation
from slowpoke_backend.ingestion import ingest

from .helpers import FakeRepository, resource_group


def test_replay_is_idempotent_by_batch_hash_and_record_ordinal() -> None:
    repository = FakeRepository({"installation": Installation(1, 10, "installation")})
    payload = json.dumps(
        {
            "resourceLogs": [
                resource_group(
                    "installation",
                    prompt_event="codex.user_prompt",
                    prompt_text="same prompt",
                )
            ]
        }
    ).encode()

    ingest("logs", payload, {}, repository, 1024 * 1024)
    ingest("logs", payload, {}, repository, 1024 * 1024)

    assert len(repository.persist_calls) == 2
    assert len(repository.batch_keys) == 1
    assert len(repository.prompt_keys) == 1
