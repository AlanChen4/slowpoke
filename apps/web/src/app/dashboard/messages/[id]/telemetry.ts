type JsonObject = Record<string, unknown>;

export type PromptResponseUsage = {
  inputTokens: number | null;
  cachedTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
};

export type ResponseUsageEvent = {
  event_timestamp: string | null;
  time_unix_nano: string | number | null;
  observed_time_unix_nano: string | number | null;
  input_token_count: string | number | null;
  cached_token_count: string | number | null;
  output_token_count: string | number | null;
  reasoning_token_count: string | number | null;
  tool_token_count: string | number | null;
  cost_usd: string | number | null;
  estimated_cost_usd: string | number | null;
  total_cost_usd: string | number | null;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function attributeValue(value: unknown): string | number | boolean | null {
  if (!isObject(value)) {
    return null;
  }

  if (typeof value.stringValue === "string") {
    return value.stringValue;
  }

  if (typeof value.intValue === "number") {
    return value.intValue;
  }

  if (typeof value.intValue === "string") {
    const parsed = Number(value.intValue);
    return Number.isFinite(parsed) ? parsed : value.intValue;
  }

  if (typeof value.doubleValue === "number") {
    return value.doubleValue;
  }

  if (typeof value.boolValue === "boolean") {
    return value.boolValue;
  }

  return null;
}

function logRecordAttributes(record: JsonObject) {
  const attributes: Record<string, string | number | boolean> = {};

  for (const attribute of objectArray(record.attributes)) {
    if (typeof attribute.key !== "string") {
      continue;
    }

    const value = attributeValue(attribute.value);
    if (value !== null) {
      attributes[attribute.key] = value;
    }
  }

  return attributes;
}

function logRecords(rawPayload: unknown) {
  if (!isObject(rawPayload)) {
    return [];
  }

  return objectArray(rawPayload.resourceLogs).flatMap((resourceGroup) =>
    objectArray(resourceGroup.scopeLogs).flatMap((scopeGroup) =>
      objectArray(scopeGroup.logRecords),
    ),
  );
}

function eventTimestamp(event: ResponseUsageEvent) {
  if (event.event_timestamp) {
    const timestamp = Date.parse(event.event_timestamp);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  const unixNanos = event.time_unix_nano ?? event.observed_time_unix_nano;
  if (typeof unixNanos === "string" || typeof unixNanos === "number") {
    const timestamp = Number(unixNanos) / 1_000_000;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  return null;
}

function numberValue(value: string | number | null) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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

export function promptRecordMetadata(rawPayload: unknown, recordIndex: number) {
  const record = logRecords(rawPayload)[recordIndex];
  return record ? logRecordAttributes(record) : {};
}

export function responseUsageForPrompt(
  events: ResponseUsageEvent[],
  promptOccurredAt: string,
  nextPromptOccurredAt: string | null,
): PromptResponseUsage | null {
  const promptTime = Date.parse(promptOccurredAt);
  const nextPromptTime = nextPromptOccurredAt ? Date.parse(nextPromptOccurredAt) : null;
  const candidates = events.filter((event) => {
    const timestamp = eventTimestamp(event);
    return (
      timestamp !== null &&
      timestamp >= promptTime &&
      (nextPromptTime === null || timestamp < nextPromptTime)
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  return {
    inputTokens: sumValues(candidates, (event) => numberValue(event.input_token_count)),
    cachedTokens: sumValues(candidates, (event) => numberValue(event.cached_token_count)),
    outputTokens: sumValues(candidates, (event) => numberValue(event.output_token_count)),
    reasoningTokens: sumValues(candidates, (event) => numberValue(event.reasoning_token_count)),
    totalTokens: sumValues(candidates, (event) => {
      const reportedTotal = numberValue(event.tool_token_count);
      if (reportedTotal !== null) {
        return reportedTotal;
      }

      const inputTokens = numberValue(event.input_token_count);
      const outputTokens = numberValue(event.output_token_count);
      return inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
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
