begin;

select plan(11);

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

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'admin-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'member-a@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'admin-b@example.test');

insert into public.organizations (id, name)
overriding system value
values (101, 'Organization A'), (102, 'Organization B');

insert into public.organization_members (organization_id, user_id, role)
values
  (101, '10000000-0000-0000-0000-000000000001', 'admin'),
  (101, '10000000-0000-0000-0000-000000000002', 'member'),
  (102, '10000000-0000-0000-0000-000000000003', 'admin');

insert into public.installations (id, organization_id, collector_id)
overriding system value
values (201, 101, 'installation-a'), (202, 102, 'installation-b');

insert into public.telemetry_batches (
  id, organization_id, installation_id, signal, content_sha256, raw_payload
)
overriding system value
values
  (301, 101, 201, 'logs', repeat('a', 64), '{"resourceLogs": []}'),
  (302, 102, 202, 'logs', repeat('b', 64), '{"resourceLogs": []}');

insert into public.prompt_events (
  organization_id,
  installation_id,
  batch_id,
  record_index,
  provider,
  event_name,
  occurred_at,
  prompt_text
)
values
  (101, 201, 301, 0, 'openai', 'codex.user_prompt', now(), 'organization a'),
  (102, 202, 302, 0, 'anthropic', 'claude_code.user_prompt', now(), 'organization b');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  'select prompt_text from public.prompt_events order by prompt_text',
  $$values ('organization a'::text)$$,
  'an administrator sees only prompts in their organization'
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
  'select * from public.installations',
  '42501',
  'permission denied for table installations',
  'installation mappings are backend-only'
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

set local role anon;
select throws_ok(
  'select * from public.prompt_events',
  '42501',
  'permission denied for table prompt_events',
  'anonymous clients cannot read prompt rows'
);

select * from finish();
rollback;
