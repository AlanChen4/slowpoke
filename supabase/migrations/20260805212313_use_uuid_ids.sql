do $$
begin
  if exists (
    select 1
    from public.installations
    where collector_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'Every collector_id must be a UUID before migrating installation IDs';
  end if;
end
$$;

alter table public.organizations
  add column new_id uuid not null default gen_random_uuid();

alter table public.organization_members
  add column new_organization_id uuid;

alter table public.installations
  add column new_id uuid,
  add column new_organization_id uuid;

alter table public.telemetry_batches
  add column new_id uuid not null default gen_random_uuid(),
  add column new_organization_id uuid,
  add column new_installation_id uuid;

alter table public.prompt_events
  add column new_id uuid not null default gen_random_uuid(),
  add column new_organization_id uuid,
  add column new_installation_id uuid,
  add column new_batch_id uuid;

update public.organization_members as membership
set new_organization_id = organization.new_id
from public.organizations as organization
where membership.organization_id = organization.id;

update public.installations as installation
set
  new_id = installation.collector_id::uuid,
  new_organization_id = organization.new_id
from public.organizations as organization
where installation.organization_id = organization.id;

update public.telemetry_batches as batch
set
  new_organization_id = organization.new_id,
  new_installation_id = installation.new_id
from
  public.organizations as organization,
  public.installations as installation
where batch.organization_id = organization.id
  and batch.installation_id = installation.id;

update public.prompt_events as prompt
set
  new_organization_id = organization.new_id,
  new_installation_id = installation.new_id,
  new_batch_id = batch.new_id
from
  public.organizations as organization,
  public.installations as installation,
  public.telemetry_batches as batch
where prompt.organization_id = organization.id
  and prompt.installation_id = installation.id
  and prompt.batch_id = batch.id;

alter table public.organization_members
  alter column new_organization_id set not null;

alter table public.installations
  alter column new_id set not null,
  alter column new_id set default gen_random_uuid(),
  alter column new_organization_id set not null;

alter table public.telemetry_batches
  alter column new_organization_id set not null,
  alter column new_installation_id set not null;

alter table public.prompt_events
  alter column new_organization_id set not null,
  alter column new_installation_id set not null,
  alter column new_batch_id set not null;

drop policy "members can read their organizations" on public.organizations;
drop policy "admins can read organization prompts" on public.prompt_events;

drop index public.organization_members_user_organization_idx;
drop index public.organization_members_admin_lookup_idx;
drop index public.installations_organization_id_idx;
drop index public.telemetry_batches_organization_received_idx;
drop index public.telemetry_batches_installation_id_idx;
drop index public.prompt_events_organization_occurred_idx;
drop index public.prompt_events_installation_id_idx;
drop index public.prompt_events_batch_id_idx;

alter table public.prompt_events
  drop constraint prompt_events_batch_id_organization_id_fkey,
  drop constraint prompt_events_installation_id_organization_id_fkey,
  drop constraint prompt_events_organization_id_fkey,
  drop constraint prompt_events_batch_id_record_index_key,
  drop constraint prompt_events_pkey;

alter table public.telemetry_batches
  drop constraint telemetry_batches_installation_id_organization_id_fkey,
  drop constraint telemetry_batches_organization_id_fkey,
  drop constraint telemetry_batches_installation_id_signal_content_sha256_key,
  drop constraint telemetry_batches_id_organization_id_key,
  drop constraint telemetry_batches_pkey;

alter table public.organization_members
  drop constraint organization_members_organization_id_fkey,
  drop constraint organization_members_pkey;

alter table public.installations
  drop constraint installations_organization_id_fkey,
  drop constraint installations_collector_id_key,
  drop constraint installations_id_organization_id_key,
  drop constraint installations_pkey;

alter table public.organizations
  drop constraint organizations_pkey;

alter table public.organizations
  drop column id;

alter table public.organizations
  rename column new_id to id;

alter table public.organization_members
  drop column organization_id;

alter table public.organization_members
  rename column new_organization_id to organization_id;

alter table public.installations
  drop column id,
  drop column organization_id,
  drop column collector_id;

alter table public.installations
  rename column new_id to id;

alter table public.installations
  rename column new_organization_id to organization_id;

alter table public.telemetry_batches
  drop column id,
  drop column organization_id,
  drop column installation_id;

alter table public.telemetry_batches
  rename column new_id to id;

alter table public.telemetry_batches
  rename column new_organization_id to organization_id;

alter table public.telemetry_batches
  rename column new_installation_id to installation_id;

alter table public.prompt_events
  drop column id,
  drop column organization_id,
  drop column installation_id,
  drop column batch_id;

alter table public.prompt_events
  rename column new_id to id;

alter table public.prompt_events
  rename column new_organization_id to organization_id;

alter table public.prompt_events
  rename column new_installation_id to installation_id;

alter table public.prompt_events
  rename column new_batch_id to batch_id;

alter table public.organizations
  add constraint organizations_pkey primary key (id);

alter table public.organization_members
  add constraint organization_members_pkey primary key (organization_id, user_id),
  add constraint organization_members_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade;

alter table public.installations
  add constraint installations_pkey primary key (id),
  add constraint installations_id_organization_id_key unique (id, organization_id),
  add constraint installations_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade;

alter table public.telemetry_batches
  add constraint telemetry_batches_pkey primary key (id),
  add constraint telemetry_batches_installation_id_signal_content_sha256_key
    unique (installation_id, signal, content_sha256),
  add constraint telemetry_batches_id_organization_id_key unique (id, organization_id),
  add constraint telemetry_batches_installation_id_organization_id_fkey
    foreign key (installation_id, organization_id)
      references public.installations (id, organization_id) on delete cascade,
  add constraint telemetry_batches_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade;

alter table public.prompt_events
  add constraint prompt_events_pkey primary key (id),
  add constraint prompt_events_batch_id_record_index_key unique (batch_id, record_index),
  add constraint prompt_events_installation_id_organization_id_fkey
    foreign key (installation_id, organization_id)
      references public.installations (id, organization_id) on delete cascade,
  add constraint prompt_events_batch_id_organization_id_fkey
    foreign key (batch_id, organization_id)
      references public.telemetry_batches (id, organization_id) on delete cascade,
  add constraint prompt_events_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade;

create index organization_members_user_organization_idx
  on public.organization_members (user_id, organization_id);

create index organization_members_admin_lookup_idx
  on public.organization_members (user_id, organization_id)
  where role = 'admin';

create index installations_organization_id_idx
  on public.installations (organization_id);

create index telemetry_batches_organization_received_idx
  on public.telemetry_batches (organization_id, received_at desc, id desc);

create index telemetry_batches_installation_id_idx
  on public.telemetry_batches (installation_id);

create index prompt_events_organization_occurred_idx
  on public.prompt_events (organization_id, occurred_at desc, id desc);

create index prompt_events_installation_id_idx
  on public.prompt_events (installation_id);

create index prompt_events_batch_id_idx
  on public.prompt_events (batch_id);

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
