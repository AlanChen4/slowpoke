import * as z from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

const integerValueSchema = z.union([
  z.number(),
  z.string().transform((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }),
]);
const attributeValueSchema = z.object({
  stringValue: z.string().optional(),
  intValue: integerValueSchema.optional(),
  doubleValue: z.number().optional(),
  boolValue: z.boolean().optional(),
});
const attributeSchema = z
  .object({
    key: z.string(),
    value: attributeValueSchema,
  })
  .nullable()
  .catch(null);
const logRecordSchema = z
  .object({
    attributes: z.array(attributeSchema).catch([]).default([]),
  })
  .catch({ attributes: [] });
const scopeLogSchema = z
  .object({
    logRecords: z.array(logRecordSchema).catch([]).default([]),
  })
  .catch({ logRecords: [] });
const resourceLogSchema = z
  .object({
    scopeLogs: z.array(scopeLogSchema).catch([]).default([]),
  })
  .catch({ scopeLogs: [] });
const telemetryPayloadSchema = z.object({
  resourceLogs: z.array(resourceLogSchema).catch([]).default([]),
});

type AttributeValue = z.infer<typeof attributeValueSchema>;
type LogRecord = z.infer<typeof logRecordSchema>;

export type PromptResponseUsage = {
  model: string | null;
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
  model: string | null;
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

function attributeValue(value: AttributeValue): string | number | boolean | null {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value.intValue !== undefined) {
    return value.intValue;
  }

  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }

  if (value.boolValue !== undefined) {
    return value.boolValue;
  }

  return null;
}

function logRecordAttributes(record: LogRecord) {
  const attributes: Record<string, string | number | boolean> = {};

  for (const attribute of record.attributes) {
    if (!attribute) {
      continue;
    }

    const value = attributeValue(attribute.value);
    if (value !== null) {
      attributes[attribute.key] = value;
    }
  }

  return attributes;
}

function logRecords(rawPayload: JsonValue | undefined) {
  const parsedPayload = telemetryPayloadSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    return [];
  }

  return parsedPayload.data.resourceLogs.flatMap((resourceGroup) =>
    resourceGroup.scopeLogs.flatMap((scopeGroup) => scopeGroup.logRecords),
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

export function promptRecordMetadata(rawPayload: JsonValue | undefined, recordIndex: number) {
  const record = logRecords(rawPayload)[recordIndex];
  return record ? logRecordAttributes(record) : {};
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
    model: candidates.find((event) => event.model)?.model ?? null,
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
