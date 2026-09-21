-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP VIEW public.response_usage_events;

CREATE FUNCTION public.normalize_response_usage_events()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.response_usage_events (
    organization_id,
    installation_id,
    batch_id,
    resource_index,
    scope_index,
    record_index,
    received_at,
    provider,
    conversation_id,
    prompt_id,
    model,
    event_timestamp,
    time_unix_nano,
    observed_time_unix_nano,
    input_token_count,
    cached_token_count,
    cache_creation_token_count,
    output_token_count,
    reasoning_token_count,
    tool_token_count,
    cost_usd,
    estimated_cost_usd,
    total_cost_usd,
    is_error,
    query_source
  )
  select
    new.organization_id,
    new.installation_id,
    new.id,
    resource_group.ordinality::integer - 1,
    scope_group.ordinality::integer - 1,
    record.ordinality::integer - 1,
    new.received_at,
    case
      when coalesce(metadata.attributes->>'event.name', record.value->>'eventName') = 'codex.sse_event'
        then 'openai'
      when record.value#>>'{body,stringValue}' in ('claude_code.api_request', 'claude_code.api_error')
        then 'anthropic'
    end,
    coalesce(
      metadata.attributes->>'conversation.id',
      metadata.attributes->>'session.id'
    ),
    metadata.attributes->>'prompt.id',
    metadata.attributes->>'model',
    metadata.attributes->>'event.timestamp',
    record.value->>'timeUnixNano',
    record.value->>'observedTimeUnixNano',
    coalesce(
      metadata.attributes->>'input_token_count',
      metadata.attributes->>'input_tokens'
    ),
    coalesce(
      metadata.attributes->>'cached_token_count',
      metadata.attributes->>'cache_read_tokens'
    ),
    coalesce(
      metadata.attributes->>'cache_write_token_count',
      metadata.attributes->>'cache_creation_tokens'
    ),
    coalesce(
      metadata.attributes->>'output_token_count',
      metadata.attributes->>'output_tokens'
    ),
    metadata.attributes->>'reasoning_token_count',
    metadata.attributes->>'tool_token_count',
    metadata.attributes->>'cost_usd',
    metadata.attributes->>'estimated_cost_usd',
    metadata.attributes->>'total_cost_usd',
    coalesce(record.value#>>'{body,stringValue}' = 'claude_code.api_error', false),
    metadata.attributes->>'query_source'
  from jsonb_array_elements(
    case
      when jsonb_typeof(new.raw_payload->'resourceLogs') = 'array'
        then new.raw_payload->'resourceLogs'
      else '[]'::jsonb
    end
  ) with ordinality as resource_group(value, ordinality)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(resource_group.value->'scopeLogs') = 'array'
        then resource_group.value->'scopeLogs'
      else '[]'::jsonb
    end
  ) with ordinality as scope_group(value, ordinality)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(scope_group.value->'logRecords') = 'array'
        then scope_group.value->'logRecords'
      else '[]'::jsonb
    end
  ) with ordinality as record(value, ordinality)
  cross join lateral (
    select jsonb_object_agg(
      attribute.value->>'key',
      coalesce(
        attribute.value->'value'->>'stringValue',
        attribute.value->'value'->>'intValue',
        attribute.value->'value'->>'doubleValue',
        attribute.value->'value'->>'boolValue'
      )
    ) filter (
      where jsonb_typeof(attribute.value->'key') = 'string'
    ) as attributes
    from jsonb_array_elements(
      case
        when jsonb_typeof(record.value->'attributes') = 'array'
          then record.value->'attributes'
        else '[]'::jsonb
      end
    ) as attribute(value)
  ) as metadata
  where new.signal = 'logs'
    and (
      (
        coalesce(metadata.attributes->>'event.name', record.value->>'eventName') = 'codex.sse_event'
        and metadata.attributes->>'event.kind' = 'response.completed'
      )
      or record.value#>>'{body,stringValue}' in ('claude_code.api_request', 'claude_code.api_error')
    )
  on conflict (batch_id, resource_index, scope_index, record_index) do nothing;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.normalize_response_usage_events()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.response_usage_events (
  organization_id            uuid                     NOT NULL,
  installation_id            uuid                     NOT NULL,
  batch_id                   uuid                     NOT NULL,
  resource_index             integer                  NOT NULL,
  scope_index                integer                  NOT NULL,
  record_index               integer                  NOT NULL,
  received_at                timestamp with time zone NOT NULL,
  provider                   text                     NOT NULL,
  conversation_id            text,
  prompt_id                  text,
  model                      text,
  event_timestamp            text,
  time_unix_nano             text,
  observed_time_unix_nano    text,
  input_token_count          text,
  cached_token_count         text,
  cache_creation_token_count text,
  output_token_count         text,
  reasoning_token_count      text,
  tool_token_count           text,
  cost_usd                   text,
  estimated_cost_usd         text,
  total_cost_usd             text,
  is_error                   boolean                  DEFAULT false NOT NULL,
  query_source               text
);

ALTER TABLE public.response_usage_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.response_usage_events
  ADD CONSTRAINT response_usage_events_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.telemetry_batches(id) ON DELETE CASCADE;

ALTER TABLE public.response_usage_events
  ADD CONSTRAINT response_usage_events_pkey PRIMARY KEY (batch_id, resource_index, scope_index, record_index);

ALTER TABLE public.response_usage_events
  ADD CONSTRAINT response_usage_events_provider_check CHECK (provider = ANY (ARRAY['anthropic'::text, 'openai'::text]));

ALTER TABLE public.response_usage_events
  ADD CONSTRAINT response_usage_events_record_index_check CHECK (record_index >= 0);

ALTER TABLE public.response_usage_events
  ADD CONSTRAINT response_usage_events_resource_index_check CHECK (resource_index >= 0);

ALTER TABLE public.response_usage_events
  ADD CONSTRAINT response_usage_events_scope_index_check CHECK (scope_index >= 0);

CREATE TRIGGER normalize_response_usage_events_after_insert
  AFTER INSERT ON public.telemetry_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_response_usage_events();

SET statement_timeout = 0;

INSERT INTO public.response_usage_events (
  organization_id,
  installation_id,
  batch_id,
  resource_index,
  scope_index,
  record_index,
  received_at,
  provider,
  conversation_id,
  prompt_id,
  model,
  event_timestamp,
  time_unix_nano,
  observed_time_unix_nano,
  input_token_count,
  cached_token_count,
  cache_creation_token_count,
  output_token_count,
  reasoning_token_count,
  tool_token_count,
  cost_usd,
  estimated_cost_usd,
  total_cost_usd,
  is_error,
  query_source
)
SELECT
  batch.organization_id,
  batch.installation_id,
  batch.id,
  resource_group.ordinality::integer - 1,
  scope_group.ordinality::integer - 1,
  record.ordinality::integer - 1,
  batch.received_at,
  CASE
    WHEN COALESCE(metadata.attributes->>'event.name', record.value->>'eventName') = 'codex.sse_event'
      THEN 'openai'
    WHEN record.value#>>'{body,stringValue}' IN ('claude_code.api_request', 'claude_code.api_error')
      THEN 'anthropic'
  END,
  COALESCE(
    metadata.attributes->>'conversation.id',
    metadata.attributes->>'session.id'
  ),
  metadata.attributes->>'prompt.id',
  metadata.attributes->>'model',
  metadata.attributes->>'event.timestamp',
  record.value->>'timeUnixNano',
  record.value->>'observedTimeUnixNano',
  COALESCE(
    metadata.attributes->>'input_token_count',
    metadata.attributes->>'input_tokens'
  ),
  COALESCE(
    metadata.attributes->>'cached_token_count',
    metadata.attributes->>'cache_read_tokens'
  ),
  COALESCE(
    metadata.attributes->>'cache_write_token_count',
    metadata.attributes->>'cache_creation_tokens'
  ),
  COALESCE(
    metadata.attributes->>'output_token_count',
    metadata.attributes->>'output_tokens'
  ),
  metadata.attributes->>'reasoning_token_count',
  metadata.attributes->>'tool_token_count',
  metadata.attributes->>'cost_usd',
  metadata.attributes->>'estimated_cost_usd',
  metadata.attributes->>'total_cost_usd',
  COALESCE(record.value#>>'{body,stringValue}' = 'claude_code.api_error', false),
  metadata.attributes->>'query_source'
FROM public.telemetry_batches AS batch
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(batch.raw_payload->'resourceLogs') = 'array'
      THEN batch.raw_payload->'resourceLogs'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS resource_group(value, ordinality)
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(resource_group.value->'scopeLogs') = 'array'
      THEN resource_group.value->'scopeLogs'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS scope_group(value, ordinality)
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(scope_group.value->'logRecords') = 'array'
      THEN scope_group.value->'logRecords'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS record(value, ordinality)
CROSS JOIN LATERAL (
  SELECT jsonb_object_agg(
    attribute.value->>'key',
    COALESCE(
      attribute.value->'value'->>'stringValue',
      attribute.value->'value'->>'intValue',
      attribute.value->'value'->>'doubleValue',
      attribute.value->'value'->>'boolValue'
    )
  ) FILTER (
    WHERE jsonb_typeof(attribute.value->'key') = 'string'
  ) AS attributes
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(record.value->'attributes') = 'array'
        THEN record.value->'attributes'
      ELSE '[]'::jsonb
    END
  ) AS attribute(value)
) AS metadata
WHERE batch.signal = 'logs'
  AND (
    (
      COALESCE(metadata.attributes->>'event.name', record.value->>'eventName') = 'codex.sse_event'
      AND metadata.attributes->>'event.kind' = 'response.completed'
    )
    OR record.value#>>'{body,stringValue}' IN ('claude_code.api_request', 'claude_code.api_error')
  )
ON CONFLICT (batch_id, resource_index, scope_index, record_index) DO NOTHING;

RESET statement_timeout;

REVOKE ALL ON TABLE public.response_usage_events
  FROM anon, authenticated, service_role;

GRANT SELECT ON public.response_usage_events TO service_role;

CREATE INDEX prompt_events_missing_model_idx ON public.prompt_events (organization_id, installation_id, PROVIDER, prompt_id, session_id)
  WHERE model IS NULL OR model_from_error;

CREATE INDEX response_usage_events_prompt_model_idx ON public.response_usage_events (organization_id, installation_id, PROVIDER, prompt_id, query_source)
  INCLUDE (conversation_id, model, is_error, event_timestamp)
  WHERE model IS NOT NULL AND model <> ''::text;

CREATE INDEX response_usage_events_conversation_idx ON public.response_usage_events (organization_id, installation_id, conversation_id, received_at)
  WHERE NOT is_error;
