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

insert into public.organizations (name)
select 'Slowblink'
where not exists (
  select 1
  from public.organizations
  where name = 'Slowblink'
);

insert into public.organization_members (organization_id, user_id, role)
select
  organization.id,
  '00000000-0000-4000-8000-000000000002',
  'admin'
from public.organizations as organization
where organization.name = 'Slowblink'
order by organization.id
limit 1
on conflict (organization_id, user_id) do nothing;

-- Stable local installation used by the development Collector credentials.
insert into public.installations (id, organization_id)
select
  '00000000-0000-4000-8000-000000000001',
  organization.id
from public.organizations as organization
where organization.name = 'Slowblink'
order by organization.id
limit 1
on conflict (id) do nothing;
