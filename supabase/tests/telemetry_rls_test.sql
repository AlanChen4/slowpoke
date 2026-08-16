begin;

select plan(24);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),
  'organizations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.organization_members'::regclass),
  'organization_members has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.installations'::regclass),
  'installations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.telemetry_batches'::regclass),
  'telemetry_batches has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.prompt_events'::regclass),
  'prompt_events has RLS enabled'
);
select results_eq(
  $$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'organization-logos'$$,
  $$values (true, 2097152::bigint, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[])$$,
  'the organization logo bucket is deployable with its upload restrictions'
);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'admin-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'member-a@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'admin-b@example.test');

insert into public.organizations (id, name)
values
  ('20000000-0000-4000-8000-000000000001', 'Organization A'),
  ('20000000-0000-4000-8000-000000000002', 'Organization B');

insert into public.organization_members (organization_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000002', 'member'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-0000-0000-000000000003', 'admin');

insert into public.installations (id, organization_id)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');

insert into public.telemetry_batches (
  id, organization_id, installation_id, signal, content_sha256, raw_payload
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'logs',
    repeat('a', 64),
    $json$
    {
      "resourceLogs": [{
        "scopeLogs": [{
          "logRecords": [{
            "timeUnixNano": "1786356001000000000",
            "eventName": "codex.sse_event",
            "attributes": [
              {"key": "conversation.id", "value": {"stringValue": "conversation-a"}},
              {"key": "event.kind", "value": {"stringValue": "response.completed"}},
              {"key": "input_token_count", "value": {"intValue": "100"}},
              {"key": "tool_token_count", "value": {"intValue": "110"}},
              {"value": {"stringValue": "ignored malformed attribute"}}
            ]
          }]
        }]
      }]
    }
    $json$::jsonb
  ),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'logs', repeat('b', 64), '{"resourceLogs": []}');

insert into public.prompt_events (
  organization_id,
  installation_id,
  batch_id,
  record_index,
  provider,
  event_name,
  occurred_at,
  session_id,
  prompt_text,
  model,
  slug
)
values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 0, 'openai', 'codex.user_prompt', '2026-08-10 10:00:00+00', 'conversation-a', 'organization a', 'gpt-5.6-sol', 'gpt-5.6-sol'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 1, 'openai', 'codex.user_prompt', '2026-08-10 10:01:00+00', 'conversation-a', 'organization a follow-up', 'gpt-5.6-sol', 'gpt-5.6-sol'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 2, 'openai', 'codex.user_prompt', '2026-08-10 10:02:00+00', 'review-a', 'organization a review', 'codex-auto-review', 'codex-auto-review'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 3, 'openai', 'codex.user_prompt', '2026-08-10 10:03:00+00', 'title-a', E'You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.\nThe tasks typically have to do with coding-related tasks, for example requests for bug fixes or questions about a codebase. The title you generate will be shown in the UI to represent the prompt.\n\nUser prompt:\norganization a', 'gpt-5.6-luna', 'gpt-5.6-luna'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 4, 'openai', 'codex.user_prompt', '2026-08-10 10:04:00+00', 'fork-a', E'You are in a fork of an existing Codex thread.\nFill the structured description field with a compact, search-oriented summary (up to 100 characters) of the thread''s current purpose.\n\nExisting thread text', 'gpt-5.6-luna', 'gpt-5.6-luna'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 5, 'openai', 'codex.user_prompt', '2026-08-10 10:05:00+00', 'safety-a', 'You are an expert at upholding safety and compliance standards for Codex ambient suggestions. Additional internal instructions.', 'gpt-5.6-luna', 'gpt-5.6-luna'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 6, 'openai', 'codex.user_prompt', '2026-08-10 10:06:00+00', 'suggestions-a', E'# Overview\n\nGenerate 0 to 3 hyperpersonalized suggestions for what this user can do with Codex in this local project: /tmp/project', 'gpt-5.6-terra', 'gpt-5.6-terra'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 7, 'openai', 'codex.user_prompt', '2026-08-10 10:07:00+00', 'projectless-suggestions-a', E'# Overview\n\nGenerate 0 to 3 hyperpersonalized suggestions for what this user can do with Codex in this Projectless task', 'gpt-5.6-terra', 'gpt-5.6-terra'),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 0, 'anthropic', 'claude_code.user_prompt', '2026-08-10 10:00:00+00', 'conversation-b', 'organization b', null, null);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  'select prompt_text from public.prompt_events order by record_index',
  $$values
    ('organization a'::text),
    ('organization a follow-up'::text),
    ('organization a review'::text),
    (E'You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.\nThe tasks typically have to do with coding-related tasks, for example requests for bug fixes or questions about a codebase. The title you generate will be shown in the UI to represent the prompt.\n\nUser prompt:\norganization a'::text),
    (E'You are in a fork of an existing Codex thread.\nFill the structured description field with a compact, search-oriented summary (up to 100 characters) of the thread''s current purpose.\n\nExisting thread text'::text),
    ('You are an expert at upholding safety and compliance standards for Codex ambient suggestions. Additional internal instructions.'::text),
    (E'# Overview\n\nGenerate 0 to 3 hyperpersonalized suggestions for what this user can do with Codex in this local project: /tmp/project'::text),
    (E'# Overview\n\nGenerate 0 to 3 hyperpersonalized suggestions for what this user can do with Codex in this Projectless task'::text)
  $$,
  'an administrator sees only prompts in their organization'
);
select results_eq(
  'select prompt_text from public.human_prompt_events order by prompt_text',
  $$values ('organization a'::text), ('organization a follow-up'::text)$$,
  'the human-prompt view keeps every user turn and removes known internal prompts'
);
select results_eq(
  'select name from public.organizations order by name',
  $$values ('Organization A'::text)$$,
  'a member sees only their organizations'
);
select throws_ok(
  'select * from public.telemetry_batches',
  '42501',
  'permission denied for table telemetry_batches',
  'raw telemetry is backend-only'
);
select throws_ok(
  'select * from public.codex_response_usage_events',
  '42501',
  'permission denied for view codex_response_usage_events',
  'compact response usage remains backend-only'
);
select results_eq(
  'select id from public.installations order by id',
  $$values ('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'an administrator sees only installations in their organization'
);
select lives_ok(
  $$update public.organizations set name = 'Renamed Organization A', logo_url = 'https://example.test/a.png' where id = '20000000-0000-4000-8000-000000000001'$$,
  'an administrator can update their organization profile'
);
select is_empty(
  $$update public.organizations set name = 'Forbidden Organization B' where id = '20000000-0000-4000-8000-000000000002' returning id$$,
  'an administrator cannot update another organization'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('organization-logos', '20000000-0000-4000-8000-000000000001/logo', '10000000-0000-0000-0000-000000000001') on conflict (bucket_id, name) do update set metadata = '{"mimetype":"image/png"}'::jsonb returning name$$,
  'an administrator can upload and replace their organization logo'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('organization-logos', '20000000-0000-4000-8000-000000000002/logo', '10000000-0000-0000-0000-000000000001')$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an administrator cannot upload a logo for another organization'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
select is_empty(
  'select * from public.prompt_events',
  'a non-admin cannot read prompt rows'
);
select is_empty(
  'select * from public.human_prompt_events',
  'a non-admin cannot read human-prompt rows'
);
select results_eq(
  'select id from public.installations order by id',
  $$values ('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'a member sees only installations in their organization'
);
select is_empty(
  $$update public.organizations set name = 'Forbidden member rename' where id = '20000000-0000-4000-8000-000000000001' returning id$$,
  'a non-admin cannot update an organization'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('organization-logos', '20000000-0000-4000-8000-000000000001/member-logo', '10000000-0000-0000-0000-000000000002')$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'a non-admin cannot upload an organization logo'
);

set local role anon;
select throws_ok(
  'select * from public.prompt_events',
  '42501',
  'permission denied for table prompt_events',
  'anonymous clients cannot read prompt rows'
);
select throws_ok(
  'select * from public.human_prompt_events',
  '42501',
  'permission denied for view human_prompt_events',
  'anonymous clients cannot read human-prompt rows'
);

set local role service_role;
select results_eq(
  $$select conversation_id, input_token_count, tool_token_count from public.codex_response_usage_events$$,
  $$values ('conversation-a'::text, '100'::text, '110'::text)$$,
  'the backend can read compact usage from eventName-only telemetry'
);

select * from finish();
rollback;
