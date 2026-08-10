type JsonObject = Record<string, unknown>;

export type PromptResponseUsage = {
  inputTokens: number | null;
  cachedTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
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

function recordTimestamp(
  record: JsonObject,
  attributes: Record<string, string | number | boolean>,
) {
  const eventTimestamp = attributes["event.timestamp"];
  if (typeof eventTimestamp === "string") {
    const timestamp = Date.parse(eventTimestamp);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  const unixNanos = record.timeUnixNano ?? record.observedTimeUnixNano;
  if (typeof unixNanos === "string" || typeof unixNanos === "number") {
    const timestamp = Number(unixNanos) / 1_000_000;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  return null;
}

function numberAttribute(attributes: Record<string, string | number | boolean>, key: string) {
  const value = attributes[key];
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function promptRecordMetadata(rawPayload: unknown, recordIndex: number) {
  const record = logRecords(rawPayload)[recordIndex];
  return record ? logRecordAttributes(record) : {};
}

export function responseUsageForPrompt(
  rawPayloads: unknown[],
  conversationId: string,
  promptOccurredAt: string,
  nextPromptOccurredAt: string | null,
): PromptResponseUsage | null {
  const promptTime = Date.parse(promptOccurredAt);
  const nextPromptTime = nextPromptOccurredAt ? Date.parse(nextPromptOccurredAt) : null;
  const candidates = rawPayloads
    .flatMap(logRecords)
    .map((record) => ({
      attributes: logRecordAttributes(record),
      timestamp: recordTimestamp(record, logRecordAttributes(record)),
    }))
    .filter(({ attributes, timestamp }) => {
      return (
        timestamp !== null &&
        timestamp >= promptTime &&
        (nextPromptTime === null || timestamp < nextPromptTime) &&
        attributes["conversation.id"] === conversationId &&
        attributes["event.name"] === "codex.sse_event" &&
        attributes["event.kind"] === "response.completed"
      );
    })
    .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));

  const attributes = candidates[0]?.attributes;
  if (!attributes) {
    return null;
  }

  const inputTokens = numberAttribute(attributes, "input_token_count");
  const outputTokens = numberAttribute(attributes, "output_token_count");
  const reportedTotal = numberAttribute(attributes, "tool_token_count");

  return {
    inputTokens,
    cachedTokens: numberAttribute(attributes, "cached_token_count"),
    outputTokens,
    reasoningTokens: numberAttribute(attributes, "reasoning_token_count"),
    totalTokens:
      reportedTotal ??
      (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
    costUsd:
      numberAttribute(attributes, "cost_usd") ??
      numberAttribute(attributes, "estimated_cost_usd") ??
      numberAttribute(attributes, "total_cost_usd"),
  };
}
