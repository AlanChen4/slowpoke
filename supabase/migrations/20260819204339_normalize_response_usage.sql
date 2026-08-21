-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP VIEW public.codex_response_usage_events;

CREATE VIEW public.response_usage_events WITH (security_invoker=true) AS SELECT batch.organization_id,
    batch.installation_id,
    batch.id AS batch_id,
    batch.received_at,
        CASE
            WHEN (COALESCE((metadata.attributes ->> 'event.name'::text), (record.value ->> 'eventName'::text)) = 'codex.sse_event'::text) THEN 'openai'::text
            WHEN ((record.value #>> '{body,stringValue}'::text[]) = 'claude_code.api_request'::text) THEN 'anthropic'::text
            ELSE NULL::text
        END AS provider,
    COALESCE((metadata.attributes ->> 'conversation.id'::text), (metadata.attributes ->> 'session.id'::text)) AS conversation_id,
    (metadata.attributes ->> 'prompt.id'::text) AS prompt_id,
    (metadata.attributes ->> 'model'::text) AS model,
    (metadata.attributes ->> 'event.timestamp'::text) AS event_timestamp,
    (record.value ->> 'timeUnixNano'::text) AS time_unix_nano,
    (record.value ->> 'observedTimeUnixNano'::text) AS observed_time_unix_nano,
    COALESCE((metadata.attributes ->> 'input_token_count'::text), (metadata.attributes ->> 'input_tokens'::text)) AS input_token_count,
    COALESCE((metadata.attributes ->> 'cached_token_count'::text), (metadata.attributes ->> 'cache_read_tokens'::text)) AS cached_token_count,
    COALESCE((metadata.attributes ->> 'cache_write_token_count'::text), (metadata.attributes ->> 'cache_creation_tokens'::text)) AS cache_creation_token_count,
    COALESCE((metadata.attributes ->> 'output_token_count'::text), (metadata.attributes ->> 'output_tokens'::text)) AS output_token_count,
    (metadata.attributes ->> 'reasoning_token_count'::text) AS reasoning_token_count,
    (metadata.attributes ->> 'tool_token_count'::text) AS tool_token_count,
    (metadata.attributes ->> 'cost_usd'::text) AS cost_usd,
    (metadata.attributes ->> 'estimated_cost_usd'::text) AS estimated_cost_usd,
    (metadata.attributes ->> 'total_cost_usd'::text) AS total_cost_usd
   FROM ((((public.telemetry_batches batch
     CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN (jsonb_typeof((batch.raw_payload -> 'resourceLogs'::text)) = 'array'::text) THEN (batch.raw_payload -> 'resourceLogs'::text)
            ELSE '[]'::jsonb
        END) resource_group(value))
     CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN (jsonb_typeof((resource_group.value -> 'scopeLogs'::text)) = 'array'::text) THEN (resource_group.value -> 'scopeLogs'::text)
            ELSE '[]'::jsonb
        END) scope_group(value))
     CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN (jsonb_typeof((scope_group.value -> 'logRecords'::text)) = 'array'::text) THEN (scope_group.value -> 'logRecords'::text)
            ELSE '[]'::jsonb
        END) record(value))
     CROSS JOIN LATERAL ( SELECT jsonb_object_agg((attribute.value ->> 'key'::text), COALESCE(((attribute.value -> 'value'::text) ->> 'stringValue'::text), ((attribute.value -> 'value'::text) ->> 'intValue'::text), ((attribute.value -> 'value'::text) ->> 'doubleValue'::text), ((attribute.value -> 'value'::text) ->> 'boolValue'::text))) FILTER (WHERE (jsonb_typeof((attribute.value -> 'key'::text)) = 'string'::text)) AS attributes
           FROM jsonb_array_elements(
                CASE
                    WHEN (jsonb_typeof((record.value -> 'attributes'::text)) = 'array'::text) THEN (record.value -> 'attributes'::text)
                    ELSE '[]'::jsonb
                END) attribute(value)) metadata)
  WHERE ((batch.signal = 'logs'::text) AND (((COALESCE((metadata.attributes ->> 'event.name'::text), (record.value ->> 'eventName'::text)) = 'codex.sse_event'::text) AND ((metadata.attributes ->> 'event.kind'::text) = 'response.completed'::text)) OR ((record.value #>> '{body,stringValue}'::text[]) = 'claude_code.api_request'::text)));

GRANT SELECT ON public.response_usage_events TO service_role;