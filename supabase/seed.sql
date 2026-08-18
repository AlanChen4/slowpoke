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

-- Stable local setup session and installation used by development tooling.
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
  '00000000-0000-4000-8000-000000000004',
  organization.id,
  '00000000-0000-4000-8000-000000000002',
  repeat('0', 64),
  array['codex']::text[],
  '2100-01-01 00:00:00+00',
  now()
from public.organizations as organization
where organization.name = 'Slowpoke'
order by organization.id
limit 1
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
  '00000000-0000-4000-8000-000000000001',
  organization.id,
  '00000000-0000-4000-8000-000000000002',
  'codex',
  'local-development',
  '00000000-0000-4000-8000-000000000004',
  now(),
  now()
from public.organizations as organization
where organization.name = 'Slowpoke'
order by organization.id
limit 1
on conflict (id) do nothing;
