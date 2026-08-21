export type PromptResponseUsage = {
  inputTokens: number | null;
  cachedTokens: number | null;
  cacheCreationTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
};

export type ResponseUsageEvent = {
  prompt_id: string | null;
  event_timestamp: string | null;
  time_unix_nano: string | number | null;
  observed_time_unix_nano: string | number | null;
  input_token_count: string | number | null;
  cached_token_count: string | number | null;
  cache_creation_token_count: string | number | null;
  output_token_count: string | number | null;
  reasoning_token_count: string | number | null;
  tool_token_count: string | number | null;
  cost_usd: string | number | null;
  estimated_cost_usd: string | number | null;
  total_cost_usd: string | number | null;
};

function eventTimestamp(event: ResponseUsageEvent) {
  if (event.event_timestamp) {
    const timestamp = Date.parse(event.event_timestamp);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  const unixNanos = event.time_unix_nano ?? event.observed_time_unix_nano;
  if (unixNanos !== null) {
    const timestamp = Number(unixNanos) / 1_000_000;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  return null;
}

function numberValue(value: string | number | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumValues(
  events: ResponseUsageEvent[],
  valueForEvent: (event: ResponseUsageEvent) => number | null,
) {
  let foundValue = false;
  let total = 0;

  for (const event of events) {
    const value = valueForEvent(event);
    if (value !== null) {
      foundValue = true;
      total += value;
    }
  }

  return foundValue ? total : null;
}

export function responseUsageForPrompt(
  events: ResponseUsageEvent[],
  promptOccurredAt: string,
  nextPromptOccurredAt: string | null,
  promptId: string | null = null,
): PromptResponseUsage | null {
  const promptTime = Date.parse(promptOccurredAt);
  const nextPromptTime = nextPromptOccurredAt ? Date.parse(nextPromptOccurredAt) : null;
  const candidates = events.filter((event) => {
    const timestamp = eventTimestamp(event);
    return (
      timestamp !== null &&
      timestamp >= promptTime &&
      (nextPromptTime === null || timestamp < nextPromptTime) &&
      (promptId === null || event.prompt_id === null || event.prompt_id === promptId)
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  return {
    inputTokens: sumValues(candidates, (event) => numberValue(event.input_token_count)),
    cachedTokens: sumValues(candidates, (event) => numberValue(event.cached_token_count)),
    cacheCreationTokens: sumValues(candidates, (event) =>
      numberValue(event.cache_creation_token_count),
    ),
    outputTokens: sumValues(candidates, (event) => numberValue(event.output_token_count)),
    reasoningTokens: sumValues(candidates, (event) => numberValue(event.reasoning_token_count)),
    totalTokens: sumValues(candidates, (event) => {
      const reportedTotal = numberValue(event.tool_token_count);
      if (reportedTotal !== null) {
        return reportedTotal;
      }

      const inputTokens = numberValue(event.input_token_count);
      const cachedTokens = numberValue(event.cached_token_count) ?? 0;
      const cacheCreationTokens = numberValue(event.cache_creation_token_count) ?? 0;
      const outputTokens = numberValue(event.output_token_count);
      return inputTokens !== null && outputTokens !== null
        ? inputTokens + cachedTokens + cacheCreationTokens + outputTokens
        : null;
    }),
    costUsd: sumValues(
      candidates,
      (event) =>
        numberValue(event.cost_usd) ??
        numberValue(event.estimated_cost_usd) ??
        numberValue(event.total_cost_usd),
    ),
  };
}
