alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_organization_idx
  on public.organization_members (user_id, organization_id);

create index organization_members_admin_lookup_idx
  on public.organization_members (user_id, organization_id)
  where role = 'admin';

create table public.installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (id, organization_id)
);

create index installations_organization_id_idx
  on public.installations (organization_id);

create table public.telemetry_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  installation_id uuid not null,
  signal text not null check (signal in ('logs', 'metrics', 'traces')),
  content_sha256 text not null check (char_length(content_sha256) = 64),
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  foreign key (installation_id, organization_id)
    references public.installations (id, organization_id) on delete cascade,
  unique (installation_id, signal, content_sha256),
  unique (id, organization_id)
);

create index telemetry_batches_organization_received_idx
  on public.telemetry_batches (organization_id, received_at desc, id desc);

create index telemetry_batches_installation_id_idx
  on public.telemetry_batches (installation_id);

create table public.prompt_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  installation_id uuid not null,
  batch_id uuid not null,
  record_index integer not null check (record_index >= 0),
  provider text not null check (provider in ('anthropic', 'openai')),
  event_name text not null,
  occurred_at timestamptz not null,
  prompt_id text,
  session_id text,
  actor_account_id text,
  actor_email text,
  prompt_text text not null,
  is_redacted boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (installation_id, organization_id)
    references public.installations (id, organization_id) on delete cascade,
  foreign key (batch_id, organization_id)
    references public.telemetry_batches (id, organization_id) on delete cascade,
  unique (batch_id, record_index)
);

create index prompt_events_organization_occurred_idx
  on public.prompt_events (organization_id, occurred_at desc, id desc);

create index prompt_events_installation_id_idx
  on public.prompt_events (installation_id);

create index prompt_events_batch_id_idx
  on public.prompt_events (batch_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.installations enable row level security;
alter table public.telemetry_batches enable row level security;
alter table public.prompt_events enable row level security;

create policy "members can read their organizations"
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = organizations.id
        and membership.user_id = (select auth.uid())
    )
  );

create policy "members can read their memberships"
  on public.organization_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "admins can read organization prompts"
  on public.prompt_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = prompt_events.organization_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'admin'
    )
  );

revoke all on table public.organizations from anon, authenticated, service_role;
revoke all on table public.organization_members from anon, authenticated, service_role;
revoke all on table public.installations from anon, authenticated, service_role;
revoke all on table public.telemetry_batches from anon, authenticated, service_role;
revoke all on table public.prompt_events from anon, authenticated, service_role;

grant select on table public.organizations to authenticated;
grant select on table public.organization_members to authenticated;
grant select on table public.prompt_events to authenticated;

grant select, insert, update, delete on table public.organizations to service_role;
grant select, insert, update, delete on table public.organization_members to service_role;
grant select, insert, update, delete on table public.installations to service_role;
grant select, insert, update, delete on table public.telemetry_batches to service_role;
grant select, insert, update, delete on table public.prompt_events to service_role;
