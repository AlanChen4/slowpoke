-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

drop policy "members can read organization installations" on public.installations;
drop policy "admins can update their organizations" on public.organizations;
drop policy "admins can read organization prompts" on public.prompt_events;

alter table public.organizations
  add column created_by_user_id uuid,
  add column idempotency_key uuid;

update public.organizations as organization
set
  created_by_user_id = (
    select membership.user_id
    from public.organization_members as membership
    where membership.organization_id = organization.id
    order by (membership.role = 'admin') desc, membership.created_at, membership.user_id
    limit 1
  ),
  idempotency_key = gen_random_uuid();

alter table public.organizations
  alter column created_by_user_id set not null,
  alter column idempotency_key set not null,
  add constraint organizations_created_by_user_id_fkey
    foreign key (created_by_user_id) references auth.users (id),
  add constraint organizations_created_by_user_id_idempotency_key_key
    unique (created_by_user_id, idempotency_key);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  normalized_email text not null check (
    normalized_email = lower(trim(normalized_email))
    and char_length(normalized_email) between 3 and 320
  ),
  role text not null check (role in ('admin', 'member')),
  invited_by_user_id uuid not null references auth.users (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  declined_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(accepted_at, declined_at, canceled_at) <= 1)
);

create index organization_invitations_organization_id_idx
  on public.organization_invitations (organization_id);

create index organization_invitations_invited_by_user_id_idx
  on public.organization_invitations (invited_by_user_id);

create unique index organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, normalized_email)
  where accepted_at is null and declined_at is null and canceled_at is null;

alter table public.organization_invitations enable row level security;

create table public.installation_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by_user_id uuid not null references auth.users (id),
  code_digest text not null unique check (code_digest ~ '^[0-9a-f]{64}$'),
  selected_tools text[] not null check (
    selected_tools = array['codex']::text[]
    or selected_tools = array['claude_code']::text[]
    or selected_tools = array['codex', 'claude_code']::text[]
  ),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index installation_enrollments_organization_id_idx
  on public.installation_enrollments (organization_id);

create index installation_enrollments_created_by_user_id_idx
  on public.installation_enrollments (created_by_user_id);

alter table public.installation_enrollments enable row level security;

insert into public.installation_enrollments (
  id,
  organization_id,
  created_by_user_id,
  code_digest,
  selected_tools,
  expires_at,
  redeemed_at,
  created_at
)
select
  installation.id,
  installation.organization_id,
  organization.created_by_user_id,
  md5(installation.id::text) || md5(installation.organization_id::text),
  array['codex']::text[],
  installation.created_at,
  installation.created_at,
  installation.created_at
from public.installations as installation
join public.organizations as organization
  on organization.id = installation.organization_id;

alter table public.installations
  add column created_by_user_id uuid,
  add column tool text,
  add column computer_name text,
  add column enrollment_id uuid,
  add column verified_at timestamptz,
  add column last_seen_at timestamptz;

update public.installations as installation
set
  created_by_user_id = organization.created_by_user_id,
  tool = 'codex',
  computer_name = 'Legacy installation',
  enrollment_id = installation.id
from public.organizations as organization
where organization.id = installation.organization_id;

alter table public.installations
  alter column created_by_user_id set not null,
  alter column tool set not null,
  alter column computer_name set not null,
  alter column enrollment_id set not null,
  add constraint installations_created_by_user_id_fkey
    foreign key (created_by_user_id) references auth.users (id),
  add constraint installations_tool_check
    check (tool in ('codex', 'claude_code')),
  add constraint installations_computer_name_check
    check (char_length(trim(computer_name)) between 1 and 255),
  add constraint installations_enrollment_id_organization_id_fkey
    foreign key (enrollment_id, organization_id)
      references public.installation_enrollments (id, organization_id),
  add constraint installations_enrollment_id_tool_key
    unique (enrollment_id, tool);

create index installations_created_by_user_organization_idx
  on public.installations (created_by_user_id, organization_id);

create index installations_active_owner_organization_idx
  on public.installations (created_by_user_id, organization_id)
  where verified_at is not null and revoked_at is null;

revoke all on table public.organization_invitations from anon, authenticated, service_role;
revoke all on table public.installation_enrollments from anon, authenticated, service_role;

grant select, insert, update, delete on table public.organization_invitations to service_role;
grant select, insert, update, delete on table public.installation_enrollments to service_role;

revoke update (name, logo_url) on table public.organizations from authenticated;

create policy "clients cannot access organization invitations"
  on public.organization_invitations
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "clients cannot access installation enrollments"
  on public.installation_enrollments
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "clients cannot access raw telemetry"
  on public.telemetry_batches
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "members can read allowed installations"
  on public.installations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = installations.organization_id
        and membership.user_id = (select auth.uid())
        and (
          membership.role = 'admin'
          or installations.created_by_user_id = (select auth.uid())
        )
    )
  );

create policy "members can read allowed prompts"
  on public.prompt_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = prompt_events.organization_id
        and membership.user_id = (select auth.uid())
        and (
          membership.role = 'admin'
          or exists (
            select 1
            from public.installations as installation
            where installation.id = prompt_events.installation_id
              and installation.organization_id = prompt_events.organization_id
              and installation.created_by_user_id = (select auth.uid())
          )
        )
    )
  );
