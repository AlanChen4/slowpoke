-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP INDEX public.prompt_events_organization_session_occurred_idx;

DROP VIEW public.first_prompt_events;

ALTER TABLE public.prompt_events
  ADD COLUMN model text;

ALTER TABLE public.prompt_events
  ADD COLUMN slug text;

ALTER TABLE public.prompt_events
  ADD COLUMN originator text;

WITH raw_records AS (
  SELECT
    batch.id AS batch_id,
    (row_number() OVER (
      PARTITION BY batch.id
      ORDER BY resource_group.ordinality, scope_group.ordinality, log_record.ordinality
    ) - 1)::integer AS record_index,
    log_record.value AS record
  FROM public.telemetry_batches AS batch
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(batch.raw_payload->'resourceLogs', '[]'::jsonb)
  ) WITH ORDINALITY AS resource_group(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(resource_group.value->'scopeLogs', '[]'::jsonb)
  ) WITH ORDINALITY AS scope_group(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(scope_group.value->'logRecords', '[]'::jsonb)
  ) WITH ORDINALITY AS log_record(value, ordinality)
), raw_prompt_metadata AS (
  SELECT
    raw_records.batch_id,
    raw_records.record_index,
    jsonb_object_agg(
      attribute.value->>'key',
      attribute.value->'value'->>'stringValue'
    ) FILTER (WHERE attribute.value->'value' ? 'stringValue') AS attributes
  FROM raw_records
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(raw_records.record->'attributes', '[]'::jsonb)
  ) AS attribute(value)
  GROUP BY raw_records.batch_id, raw_records.record_index
)
UPDATE public.prompt_events AS prompt
SET
  model = metadata.attributes->>'model',
  slug = metadata.attributes->>'slug',
  originator = metadata.attributes->>'originator'
FROM raw_prompt_metadata AS metadata
WHERE metadata.batch_id = prompt.batch_id
  AND metadata.record_index = prompt.record_index
  AND metadata.attributes->>'event.name' = prompt.event_name;

CREATE VIEW public.human_prompt_events WITH (security_invoker=true) AS SELECT id,
    organization_id,
    installation_id,
    batch_id,
    record_index,
    provider,
    event_name,
    occurred_at,
    prompt_id,
    session_id,
    actor_account_id,
    actor_email,
    prompt_text,
    is_redacted,
    created_at,
    model,
    slug,
    originator
  FROM public.prompt_events
  WHERE ((COALESCE(model, ''::text) <> 'codex-auto-review'::text) AND (COALESCE(slug, ''::text) <> 'codex-auto-review'::text));

REVOKE ALL ON public.human_prompt_events FROM anon, authenticated, service_role;

GRANT SELECT ON public.human_prompt_events TO authenticated;
