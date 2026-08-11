-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

GRANT SELECT ON public.installations TO authenticated;

CREATE POLICY "members can read organization installations" ON public.installations
  FOR SELECT
  TO authenticated
  USING ((organization_id IN ( SELECT membership.organization_id
   FROM public.organization_members membership
  WHERE (membership.user_id = ( SELECT auth.uid() AS uid)))));

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_name_check CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80);

ALTER TABLE public.organizations
  ADD COLUMN logo_url text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_logo_url_check CHECK (logo_url IS NULL OR char_length(logo_url) <= 2048);

GRANT UPDATE (logo_url, name) ON public.organizations TO authenticated;

CREATE POLICY "admins can update their organizations" ON public.organizations
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE ((membership.organization_id = organizations.id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE ((membership.organization_id = organizations.id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'admin'::text)))));

UPDATE public.organizations
SET name = 'Slowpoke'
WHERE name = 'Slowblink';

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
  WHERE ((COALESCE(model, ''::text) <> 'codex-auto-review'::text) AND (COALESCE(slug, ''::text) <> 'codex-auto-review'::text) AND (NOT starts_with(prompt_text, 'You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.
The tasks typically have to do with coding-related tasks, for example requests for bug fixes or questions about a codebase. The title you generate will be shown in the UI to represent the prompt.'::text)) AND (NOT starts_with(prompt_text, 'You are in a fork of an existing Codex thread.
Fill the structured description field with a compact, search-oriented summary (up to 100 characters) of the thread''s current purpose.'::text)) AND (NOT starts_with(prompt_text, 'You are an expert at upholding safety and compliance standards for Codex ambient suggestions.'::text)) AND (strpos(prompt_text, 'Generate 0 to 3 hyperpersonalized suggestions for what this user can do with Codex in this '::text) = 0));

REVOKE ALL ON public.human_prompt_events FROM anon, authenticated, service_role;

GRANT SELECT ON public.human_prompt_events TO authenticated;

CREATE POLICY "organization admins can read logo objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id::text = (storage.foldername(name))[1]
        AND membership.user_id = (SELECT auth.uid())
        AND membership.role = 'admin'
    )
  );

CREATE POLICY "organization admins can upload logo objects"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'organization-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id::text = (storage.foldername(name))[1]
        AND membership.user_id = (SELECT auth.uid())
        AND membership.role = 'admin'
    )
  );

CREATE POLICY "organization admins can replace logo objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id::text = (storage.foldername(name))[1]
        AND membership.user_id = (SELECT auth.uid())
        AND membership.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'organization-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id::text = (storage.foldername(name))[1]
        AND membership.user_id = (SELECT auth.uid())
        AND membership.role = 'admin'
    )
  );
