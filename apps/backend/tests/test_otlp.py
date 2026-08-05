from __future__ import annotations

from slowpoke_backend.otlp import partition_export

from .helpers import resource_group


def test_partitions_mixed_resources_and_extracts_documented_prompts() -> None:
    payload = {
        "resourceLogs": [
            resource_group(
                "codex-installation",
                prompt_event="codex.user_prompt",
                prompt_text="Ask Codex",
                service_name="codex_cli_rs",
            ),
            resource_group(
                "claude-installation",
                prompt_event="claude_code.user_prompt",
                prompt_text="Ask Claude",
                service_name="claude-code",
            ),
        ]
    }

    partitions = partition_export(payload, "logs")

    assert {partition.installation_id for partition in partitions} == {
        "codex-installation",
        "claude-installation",
    }
    prompts = {
        partition.installation_id: partition.prompts[0] for partition in partitions
    }
    assert prompts["codex-installation"].provider == "openai"
    assert prompts["codex-installation"].prompt_text == "Ask Codex"
    assert prompts["claude-installation"].provider == "anthropic"
    assert prompts["claude-installation"].prompt_text == "Ask Claude"
    assert prompts["claude-installation"].session_id == "session-claude-installation"


def test_redacted_prompt_is_stored_with_redaction_state() -> None:
    partition = partition_export(
        {
            "resourceLogs": [
                resource_group(
                    "installation",
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
    partition = partition_export(
        {
            "resourceLogs": [
                resource_group(
                    "installation",
                    prompt_event="other.user_prompt",
                    prompt_text="private",
                )
            ]
        },
        "logs",
    )[0]
    assert partition.prompts == ()


def test_ignores_unrelated_attribute_types_but_preserves_raw_payload() -> None:
    group = resource_group(
        "installation",
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
    first = {
        "resourceLogs": [resource_group("installation")],
    }
    second_group = resource_group("installation")
    second = {"resourceLogs": [dict(reversed(list(second_group.items())))]}

    first_partition = partition_export(first, "logs")[0]
    second_partition = partition_export(second, "logs")[0]

    assert first_partition.content_sha256 == second_partition.content_sha256


def test_metrics_and_traces_are_partitioned_without_prompts() -> None:
    metrics = partition_export(
        {"resourceMetrics": [resource_group("installation")]}, "metrics"
    )
    traces = partition_export(
        {"resourceSpans": [resource_group("installation")]}, "traces"
    )

    assert metrics[0].prompts == ()
    assert traces[0].prompts == ()
