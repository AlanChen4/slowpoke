alter table public.prompt_events add column model_is_fallback boolean not null default false;

create view public.claude_model_events with (security_invoker = true) as
 SELECT batch.organization_id,
    batch.installation_id,
    batch.id AS batch_id,
    COALESCE(metadata.attributes ->> 'conversation.id'::text, metadata.attributes ->> 'session.id'::text) AS session_id,
    metadata.attributes ->> 'prompt.id'::text AS prompt_id,
    metadata.attributes ->> 'model'::text AS model,
    metadata.attributes ->> 'event.timestamp'::text AS event_timestamp,
    (record.value #>> '{body,stringValue}'::text[]) = 'claude_code.api_error'::text AS is_error
   FROM public.telemetry_batches batch
     CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(batch.raw_payload -> 'resourceLogs'::text) = 'array'::text THEN batch.raw_payload -> 'resourceLogs'::text
            ELSE '[]'::jsonb
        END) resource_group(value)
     CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(resource_group.value -> 'scopeLogs'::text) = 'array'::text THEN resource_group.value -> 'scopeLogs'::text
            ELSE '[]'::jsonb
        END) scope_group(value)
     CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(scope_group.value -> 'logRecords'::text) = 'array'::text THEN scope_group.value -> 'logRecords'::text
            ELSE '[]'::jsonb
        END) record(value)
     CROSS JOIN LATERAL ( SELECT jsonb_object_agg(attribute.value ->> 'key'::text, COALESCE((attribute.value -> 'value'::text) ->> 'stringValue'::text, (attribute.value -> 'value'::text) ->> 'intValue'::text, (attribute.value -> 'value'::text) ->> 'doubleValue'::text, (attribute.value -> 'value'::text) ->> 'boolValue'::text)) FILTER (WHERE jsonb_typeof(attribute.value -> 'key'::text) = 'string'::text) AS attributes
           FROM jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(record.value -> 'attributes'::text) = 'array'::text THEN record.value -> 'attributes'::text
                    ELSE '[]'::jsonb
                END) attribute(value)) metadata
  WHERE batch.signal = 'logs'::text AND ((record.value #>> '{body,stringValue}'::text[]) = ANY (ARRAY['claude_code.api_request'::text, 'claude_code.api_error'::text]));

revoke all on table public.claude_model_events from anon, authenticated, service_role;
grant select on table public.claude_model_events to service_role;
