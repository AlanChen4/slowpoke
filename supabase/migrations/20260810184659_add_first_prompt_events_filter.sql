-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

CREATE INDEX prompt_events_organization_session_occurred_idx ON public.prompt_events (organization_id, session_id, occurred_at, id)
  WHERE session_id IS NOT NULL;

CREATE VIEW public.first_prompt_events WITH (security_invoker=true) AS SELECT DISTINCT ON (organization_id, session_id) id,
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
    created_at
   FROM public.prompt_events
  WHERE (session_id IS NOT NULL)
  ORDER BY organization_id, session_id, occurred_at, id;

GRANT SELECT ON public.first_prompt_events TO authenticated;