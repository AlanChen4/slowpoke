import { describe, expect, it } from "vitest";

import { responseUsageForPrompt, type ResponseUsageEvent } from "./telemetry";

function usageEvent(overrides: Partial<ResponseUsageEvent> = {}): ResponseUsageEvent {
  return {
    event_timestamp: "2026-08-10T10:00:01.000Z",
    time_unix_nano: null,
    observed_time_unix_nano: null,
    input_token_count: null,
    cached_token_count: null,
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
      inputTokens: 220,
      cachedTokens: 120,
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
});
