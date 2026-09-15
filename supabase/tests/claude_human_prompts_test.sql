begin;

select plan(5);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

create temporary table prompt_cases (
  record_index integer generated always as identity,
  label text,
  prompt_text text,
  command_name text,
  command_source text,
  keep boolean
);

insert into prompt_cases (label, prompt_text, command_name, command_source, keep)
values
  ('clear', '/clear', 'clear', 'builtin', false),
  ('resume', '/resume', 'resume', 'builtin', false),
  ('compact', '/compact', 'compact', 'builtin', false),
  ('setup', '<REDACTED>', 'auto-mode-setup', 'builtin', false),
  ('limits', '/rate-limit-options', 'rate-limit-options', 'builtin', false),
  ('plugin', '/plugin', 'plugin', 'builtin', false),
  ('plugins', '/plugins', 'plugins', 'builtin', false),
  ('branch', '/branch', 'branch', 'builtin', false),
  ('logout', '/logout', 'logout', 'builtin', false),
  ('agent', E'<agent-message from="worker">\nTask finished.\n</agent-message>', null, null, false),
  ('notification', E'<task-notification>\n<status>stopped</status>\n</task-notification>', null, null, false),
  ('directory', E'<system-reminder>\nThe session''s working directory has changed to /tmp/project.\n</system-reminder>', null, null, false),
  ('dev server', E'The dev server failed to start with the following error:\n\n```\nAddress in use\n```', null, null, false),
  ('restart', 'The app was quit while you were working. Please continue from where you left off.', null, null, false),
  ('ordinary', 'Fix the carousel', null, null, true),
  ('repeated', 'Fix the carousel', null, null, true),
  ('redacted', '<REDACTED>', null, null, true),
  ('task command', '/batch fix the tests', 'batch', 'builtin', true),
  ('custom command', '/compact source files', 'compact', 'custom', true),
  ('mcp command', '/compact source files', 'compact', 'mcp', true),
  ('unknown command', '/artifact-design', 'artifact-design', 'builtin', true),
  ('quoted notification', 'Explain this <task-notification> message', null, null, true),
  ('other reminder', E'<system-reminder>\nReview this user-provided example.\n</system-reminder>', null, null, true);

insert into public.telemetry_batches (
  id, organization_id, installation_id, signal, content_sha256, raw_payload
)
select
  '49000000-0000-4000-8000-000000000001', organization_id, id,
  'logs', repeat('9', 64), '{"resourceLogs": []}'::jsonb
from public.installations
where tool = 'claude_code'
order by id
limit 1;

insert into public.prompt_events (
  organization_id, installation_id, batch_id, record_index, provider,
  event_name, occurred_at, prompt_text, command_name, command_source, model
)
select
  batch.organization_id, batch.installation_id, batch.id, fixture.record_index,
  'anthropic', 'claude_code.user_prompt', '2040-01-01 00:00:00+00',
  fixture.prompt_text, fixture.command_name, fixture.command_source,
  case when fixture.keep then null else 'maintenance-model' end
from prompt_cases fixture
cross join public.telemetry_batches batch
where batch.id = '49000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.human_prompt_events p join prompt_cases f using (record_index)
   where p.batch_id = '49000000-0000-4000-8000-000000000001' and not f.keep and f.command_name is not null),
  0::bigint, 'built-in setup and maintenance commands are not human prompts, even when redacted'
);
select is(
  (select count(*) from public.human_prompt_events p join prompt_cases f using (record_index)
   where p.batch_id = '49000000-0000-4000-8000-000000000001' and not f.keep and f.command_name is null),
  0::bigint, 'Claude-generated messages are not human prompts'
);
select results_eq(
  $$select f.label from public.human_prompt_events p join prompt_cases f using (record_index)
    where p.batch_id = '49000000-0000-4000-8000-000000000001' order by f.label$$,
  $$select label from prompt_cases where keep order by label$$,
  'human, repeated, redacted, task, custom, MCP, unknown-command, and quoted inputs remain visible'
);
select results_eq(
  $$select model, prompts from public.get_prompt_analytics_models(
    (select organization_id from public.telemetry_batches where id = '49000000-0000-4000-8000-000000000001'),
    7, 'UTC', '2040-01-02 00:00:00+00'
  )$$,
  $$values ('Unknown'::text, 9::bigint)$$,
  'model analytics retain unresolved human prompts without counting maintenance models'
);
select is(
  (select count(*) from public.prompt_events where batch_id = '49000000-0000-4000-8000-000000000001'),
  23::bigint, 'all source prompt records remain available'
);

select * from finish();
rollback;
