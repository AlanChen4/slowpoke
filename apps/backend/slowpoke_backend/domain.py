from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

type Signal = Literal["logs", "metrics", "traces"]
type Provider = Literal["anthropic", "openai"]


@dataclass(frozen=True, slots=True)
class Installation:
    id: int
    organization_id: int
    collector_id: str


@dataclass(frozen=True, slots=True)
class Prompt:
    record_index: int
    provider: Provider
    event_name: str
    occurred_at: datetime
    prompt_id: str | None
    session_id: str | None
    actor_account_id: str | None
    actor_email: str | None
    prompt_text: str
    is_redacted: bool
    attributes: dict[str, object]
    resource_attributes: dict[str, object]


@dataclass(frozen=True, slots=True)
class Partition:
    installation_id: str
    signal: Signal
    payload: dict[str, object]
    content_sha256: str
    prompts: tuple[Prompt, ...]
