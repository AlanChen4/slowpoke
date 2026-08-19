import { describe, expect, it } from "vitest";

import { promptRecordMetadata, responseUsageForPrompt, type ResponseUsageEvent } from "./telemetry";

function usageEvent(overrides: Partial<ResponseUsageEvent> = {}): ResponseUsageEvent {
  return {
    prompt_id: null,
    model: null,
    event_timestamp: "2026-08-10T10:00:01.000Z",
    time_unix_nano: null,
    observed_time_unix_nano: null,
    input_token_count: null,
    cached_token_count: null,
    cache_creation_token_count: null,
    output_token_count: null,
    reasoning_token_count: null,
    tool_token_count: null,
    cost_usd: null,
    estimated_cost_usd: null,
    total_cost_usd: null,
    ...overrides,
  };
}

describe("responseUsageForPrompt", () => {
  it("aggregates every completed response before the next prompt", () => {
    const usage = responseUsageForPrompt(
      [
        usageEvent({
          input_token_count: "100",
          cached_token_count: "20",
          output_token_count: "10",
          reasoning_token_count: "2",
          tool_token_count: "110",
          cost_usd: "0.10",
        }),
        usageEvent({
          event_timestamp: "2026-08-10T10:00:02.000Z",
          input_token_count: "120",
          cached_token_count: "100",
          output_token_count: "5",
          reasoning_token_count: "1",
          tool_token_count: "125",
          estimated_cost_usd: "0.20",
        }),
      ],
      "2026-08-10T10:00:00.000Z",
      "2026-08-10T10:00:03.000Z",
    );

    expect(usage).toEqual({
      model: null,
      inputTokens: 220,
      cachedTokens: 120,
      cacheCreationTokens: null,
      outputTokens: 15,
      reasoningTokens: 3,
      totalTokens: 235,
      costUsd: expect.closeTo(0.3),
    });
  });

  it("ignores completions outside the prompt window", () => {
    const usage = responseUsageForPrompt(
      [
        usageEvent({
          event_timestamp: "2026-08-10T09:59:59.000Z",
          tool_token_count: "10",
        }),
        usageEvent({
          event_timestamp: "2026-08-10T10:00:03.000Z",
          tool_token_count: "20",
        }),
      ],
      "2026-08-10T10:00:00.000Z",
      "2026-08-10T10:00:03.000Z",
    );

    expect(usage).toBeNull();
  });

  it("uses OTLP nanoseconds and derives totals when needed", () => {
    const usage = responseUsageForPrompt(
      [
        usageEvent({
          event_timestamp: null,
          time_unix_nano: "1786356001000000000",
          input_token_count: 40,
          output_token_count: 2,
        }),
      ],
      "2026-08-10T10:00:00.000Z",
      null,
    );

    expect(usage?.totalTokens).toBe(42);
  });

  it("associates Claude usage by prompt ID and includes cache creation", () => {
    const usage = responseUsageForPrompt(
      [
        usageEvent({
          prompt_id: "other-prompt",
          input_token_count: "999",
          output_token_count: "999",
        }),
        usageEvent({
          prompt_id: "selected-prompt",
          model: "claude-haiku-4-5-20251001",
          input_token_count: "10",
          cached_token_count: "25823",
          cache_creation_token_count: "15242",
          output_token_count: "478",
          cost_usd: "0.0354663",
        }),
      ],
      "2026-08-10T10:00:00.000Z",
      null,
      "selected-prompt",
    );

    expect(usage).toEqual({
      model: "claude-haiku-4-5-20251001",
      inputTokens: 10,
      cachedTokens: 25823,
      cacheCreationTokens: 15242,
      outputTokens: 478,
      reasoningTokens: null,
      totalTokens: 41553,
      costUsd: 0.0354663,
    });
  });
});

describe("promptRecordMetadata", () => {
  it("parses supported OTLP attributes and skips malformed entries", () => {
    const metadata = promptRecordMetadata(
      {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    attributes: [
                      { key: "model", value: { stringValue: "gpt-5" } },
                      { key: "prompt_length", value: { intValue: "42" } },
                      { value: { stringValue: "missing key" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      0,
    );

    expect(metadata).toEqual({ model: "gpt-5", prompt_length: 42 });
  });

  it("returns no metadata for an invalid payload", () => {
    expect(promptRecordMetadata("not an OTLP payload", 0)).toEqual({});
  });
});
