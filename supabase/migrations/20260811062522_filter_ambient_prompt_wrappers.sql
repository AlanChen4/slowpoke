-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

CREATE OR REPLACE VIEW public.human_prompt_events WITH (security_invoker=true) AS SELECT id,
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
Fill the structured description field with a compact, search-oriented summary (up to 100 characters) of the thread''s current purpose.'::text)) AND (NOT starts_with(prompt_text, 'You are an expert at upholding safety and compliance standards for Codex ambient suggestions.'::text)) AND (strpos(prompt_text, 'Generate 0 to 3 hyperpersonalized suggestions for what this user can do with Codex in this local project:'::text) = 0));