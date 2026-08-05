from __future__ import annotations

from uuid import UUID

from slowpoke_backend.otlp import partition_export

from .helpers import resource_group


def test_partitions_mixed_resources_and_extracts_documented_prompts() -> None:
    codex_id = UUID("00000000-0000-4000-8000-000000000001")
    claude_id = UUID("00000000-0000-4000-8000-000000000002")
    payload = {
        "resourceLogs": [
            resource_group(
                codex_id,
                prompt_event="codex.user_prompt",
                prompt_text="Ask Codex",
                service_name="codex_cli_rs",
            ),
            resource_group(
                claude_id,
                prompt_event="claude_code.user_prompt",
                prompt_text="Ask Claude",
                service_name="claude-code",
            ),
        ]
    }

    partitions = partition_export(payload, "logs")

    assert {partition.installation_id for partition in partitions} == {
        codex_id,
        claude_id,
    }
    prompts = {
        partition.installation_id: partition.prompts[0] for partition in partitions
    }
    assert prompts[codex_id].provider == "openai"
    assert prompts[codex_id].prompt_text == "Ask Codex"
    assert prompts[claude_id].provider == "anthropic"
    assert prompts[claude_id].prompt_text == "Ask Claude"
    assert prompts[claude_id].session_id == f"session-{claude_id}"


def test_redacted_prompt_is_stored_with_redaction_state() -> None:
    installation_id = UUID("00000000-0000-4000-8000-000000000001")
    partition = partition_export(
        {
            "resourceLogs": [
                resource_group(
                    installation_id,
                    prompt_event="claude_code.user_prompt",
                    prompt_text=None,
                )
            ]
        },
        "logs",
    )[0]

    assert partition.prompts[0].prompt_text == "<REDACTED>"
    assert partition.prompts[0].is_redacted is True


def test_undocumented_log_names_do_not_create_prompt_rows() -> None:
    installation_id = UUID("00000000-0000-4000-8000-000000000001")
    partition = partition_export(
        {
            "resourceLogs": [
                resource_group(
                    installation_id,
                    prompt_event="other.user_prompt",
                    prompt_text="private",
                )
            ]
        },
        "logs",
    )[0]
    assert partition.prompts == ()


def test_ignores_unrelated_attribute_types_but_preserves_raw_payload() -> None:
    installation_id = UUID("00000000-0000-4000-8000-000000000001")
    group = resource_group(
        installation_id,
        prompt_event="codex.user_prompt",
        prompt_text="keep useful strings",
    )
    resource = group["resource"]
    assert isinstance(resource, dict)
    resource_attributes = resource["attributes"]
    assert isinstance(resource_attributes, list)
    resource_attributes.extend(
        [
            {"key": "nested", "value": {"arrayValue": {"values": []}}},
            {"key": "count", "value": {"intValue": "42"}},
            {"malformed": True},
        ]
    )

    partition = partition_export({"resourceLogs": [group]}, "logs")[0]

    assert partition.prompts[0].prompt_text == "keep useful strings"
    assert partition.payload["resourceLogs"] == [group]


def test_hash_is_canonical_and_replay_key_is_stable() -> None:
    installation_id = UUID("00000000-0000-4000-8000-000000000001")
    first = {
        "resourceLogs": [resource_group(installation_id)],
    }
    second_group = resource_group(installation_id)
    second = {"resourceLogs": [dict(reversed(list(second_group.items())))]}

    first_partition = partition_export(first, "logs")[0]
    second_partition = partition_export(second, "logs")[0]

    assert first_partition.content_sha256 == second_partition.content_sha256


def test_metrics_and_traces_are_partitioned_without_prompts() -> None:
    installation_id = UUID("00000000-0000-4000-8000-000000000001")
    metrics = partition_export(
        {"resourceMetrics": [resource_group(installation_id)]}, "metrics"
    )
    traces = partition_export(
        {"resourceSpans": [resource_group(installation_id)]}, "traces"
    )

    assert metrics[0].prompts == ()
    assert traces[0].prompts == ()
