-- Stable local user for the development magic-link flow.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'dev@slowpoke.ai',
  now(),
  '',
  '',
  '',
  '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '{"sub": "00000000-0000-4000-8000-000000000002", "email": "dev@slowpoke.ai", "email_verified": true}'::jsonb,
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

insert into public.organizations (name, created_by_user_id, idempotency_key)
select
  'Slowpoke',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
where not exists (
  select 1
  from public.organizations
  where name = 'Slowpoke'
);

insert into public.organization_members (organization_id, user_id, role)
select
  organization.id,
  '00000000-0000-4000-8000-000000000002',
  'admin'
from public.organizations as organization
where organization.name = 'Slowpoke'
order by organization.id
limit 1
on conflict (organization_id, user_id) do nothing;

insert into public.installation_setup_sessions (
  id,
  organization_id,
  created_by_user_id,
  code_digest,
  selected_tools,
  expires_at,
  redeemed_at
)
select
  setup.id,
  organization.id,
  '00000000-0000-4000-8000-000000000002',
  setup.code_digest,
  setup.selected_tools,
  now() + interval '1 day',
  now() - interval '120 days'
from public.organizations as organization
cross join (
  values
    (
      '51000000-0000-4000-8000-000000000001'::uuid,
      repeat('a', 64),
      array['codex']::text[]
    ),
    (
      '51000000-0000-4000-8000-000000000002'::uuid,
      repeat('b', 64),
      array['claude_code']::text[]
    )
) as setup(id, code_digest, selected_tools)
where organization.name = 'Slowpoke'
order by organization.id
limit 2
on conflict (id) do nothing;

insert into public.installations (
  id,
  organization_id,
  created_by_user_id,
  tool,
  computer_name,
  setup_session_id,
  verified_at,
  last_seen_at
)
select
  installation.id,
  organization.id,
  '00000000-0000-4000-8000-000000000002',
  installation.tool,
  'Analytics demo',
  installation.setup_session_id,
  now() - interval '120 days',
  now()
from public.organizations as organization
cross join (
  values
    (
      '50000000-0000-4000-8000-000000000001'::uuid,
      'codex'::text,
      '51000000-0000-4000-8000-000000000001'::uuid
    ),
    (
      '50000000-0000-4000-8000-000000000002'::uuid,
      'claude_code'::text,
      '51000000-0000-4000-8000-000000000002'::uuid
    )
) as installation(id, tool, setup_session_id)
where organization.name = 'Slowpoke'
order by organization.id
limit 2
on conflict (id) do nothing;

insert into public.telemetry_batches (
  id,
  organization_id,
  installation_id,
  signal,
  content_sha256,
  raw_payload,
  received_at
)
select
  batch.id,
  organization.id,
  batch.installation_id,
  'logs',
  batch.content_sha256,
  '{"resourceLogs": []}'::jsonb,
  now()
from public.organizations as organization
cross join (
  values
    (
      '52000000-0000-4000-8000-000000000001'::uuid,
      '50000000-0000-4000-8000-000000000001'::uuid,
      repeat('c', 64)
    ),
    (
      '52000000-0000-4000-8000-000000000002'::uuid,
      '50000000-0000-4000-8000-000000000002'::uuid,
      repeat('d', 64)
    )
) as batch(id, installation_id, content_sha256)
where organization.name = 'Slowpoke'
order by organization.id
limit 2
on conflict (id) do nothing;

insert into public.prompt_events (
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
  model,
  originator
)
select
  organization.id,
  case when sample.index % 3 = 0
    then '50000000-0000-4000-8000-000000000002'::uuid
    else '50000000-0000-4000-8000-000000000001'::uuid
  end,
  case when sample.index % 3 = 0
    then '52000000-0000-4000-8000-000000000002'::uuid
    else '52000000-0000-4000-8000-000000000001'::uuid
  end,
  sample.index,
  case when sample.index % 3 = 0 then 'anthropic' else 'openai' end,
  case when sample.index % 3 = 0 then 'claude_code.user_prompt' else 'codex.user_prompt' end,
  date_trunc('day', now()) - interval '1 day'
    - make_interval(days => sample.index % 118)
    + make_interval(hours => 7 + (sample.index * 5) % 14)
    + make_interval(mins => (sample.index * 11) % 60),
  'demo-prompt-' || sample.index,
  'demo-session-' || sample.index / 3,
  case when sample.index % 19 = 0 then 'account-' || sample.index % 5 end,
  case sample.index % 17
    when 0 then null
    when 1 then 'dev@slowpoke.ai'
    when 2 then 'alex@slowpoke.ai'
    when 3 then 'alex@slowpoke.ai'
    when 4 then 'casey@slowpoke.ai'
    when 5 then 'casey@slowpoke.ai'
    when 6 then 'casey@slowpoke.ai'
    when 7 then 'jordan@slowpoke.ai'
    when 8 then 'jordan@slowpoke.ai'
    when 9 then 'morgan@slowpoke.ai'
    when 10 then 'riley@slowpoke.ai'
    when 11 then 'sam@slowpoke.ai'
    when 12 then 'taylor@slowpoke.ai'
    when 13 then 'taylor@slowpoke.ai'
    when 14 then 'taylor@slowpoke.ai'
    when 15 then 'taylor@slowpoke.ai'
    else null
  end,
  'Analytics demo prompt ' || sample.index || ': help the team complete a realistic task.',
  sample.index % 23 = 0,
  case
    when sample.index % 3 = 0 and sample.index % 5 = 0 then 'claude-opus-4-1'
    when sample.index % 3 = 0 then 'claude-sonnet-4-5'
    when sample.index % 7 = 0 then 'gpt-5.2-codex'
    when sample.index % 5 = 0 then 'gpt-5.1-codex-mini'
    when sample.index % 11 = 0 then null
    else 'gpt-5.3-codex'
  end,
  case when sample.index % 3 = 0 then 'claude-code' else 'codex' end
from public.organizations as organization
cross join generate_series(0, 359) as sample(index)
where organization.name = 'Slowpoke'
order by organization.id
limit 360
on conflict (batch_id, record_index) do nothing;
