alter table public.prompt_events
  add column command_name text,
  add column command_source text;

create or replace view public.human_prompt_events
with (security_invoker = true) as
select
  id,
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
from public.prompt_events
where coalesce(model, '') <> 'codex-auto-review'
  and coalesce(slug, '') <> 'codex-auto-review'
  and not starts_with(
    prompt_text,
    E'You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.\nThe tasks typically have to do with coding-related tasks, for example requests for bug fixes or questions about a codebase. The title you generate will be shown in the UI to represent the prompt.'
  )
  and not starts_with(
    prompt_text,
    E'You are in a fork of an existing Codex thread.\nFill the structured description field with a compact, search-oriented summary (up to 100 characters) of the thread''s current purpose.'
  )
  and not starts_with(
    prompt_text,
    'You are an expert at upholding safety and compliance standards for Codex ambient suggestions.'
  )
  and not starts_with(
    prompt_text,
    'You write the one-line activity update displayed beneath an existing Codex task title.'
  )
  and strpos(
    prompt_text,
    'Generate 0 to 3 hyperpersonalized suggestions for what this user can do with Codex in this '
  ) = 0
  and not (
    provider = 'anthropic'
    and (
      -- Setup and session maintenance are not human task prompts.
      (coalesce(command_source, '') = 'builtin' and coalesce(command_name, '') in (
        'clear', 'resume', 'compact', 'auto-mode-setup', 'rate-limit-options',
        'plugin', 'plugins', 'branch', 'logout'
      ))
      or starts_with(prompt_text, '<agent-message from=')
      or starts_with(prompt_text, E'<task-notification>\n')
      or starts_with(prompt_text, E'<system-reminder>\nThe session''s working directory has changed to ')
      or starts_with(prompt_text, E'The dev server failed to start with the following error:\n')
      or prompt_text = 'The app was quit while you were working. Please continue from where you left off.'
    )
  );
