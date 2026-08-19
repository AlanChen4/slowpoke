alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create extension if not exists pg_trgm with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  logo_url text check (logo_url is null or char_length(logo_url) <= 2048),
  created_by_user_id uuid not null references auth.users (id),
  idempotency_key uuid not null,
  unique (created_by_user_id, idempotency_key)
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

create table public.installation_setup_sessions (
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

create index installation_setup_sessions_organization_id_idx
  on public.installation_setup_sessions (organization_id);

create index installation_setup_sessions_created_by_user_id_idx
  on public.installation_setup_sessions (created_by_user_id);

create table public.installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by_user_id uuid not null references auth.users (id),
  tool text not null check (tool in ('codex', 'claude_code')),
  computer_name text not null check (char_length(trim(computer_name)) between 1 and 255),
  setup_session_id uuid not null,
  verified_at timestamptz,
  last_seen_at timestamptz,
  foreign key (setup_session_id, organization_id)
    references public.installation_setup_sessions (id, organization_id),
  unique (id, organization_id),
  unique (setup_session_id, tool)
);

create index installations_organization_id_idx
  on public.installations (organization_id);

create index installations_created_by_user_organization_idx
  on public.installations (created_by_user_id, organization_id);

create index installations_active_owner_organization_idx
  on public.installations (created_by_user_id, organization_id)
  where verified_at is not null and revoked_at is null;

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

create index telemetry_batches_org_install_logs_received_idx
  on public.telemetry_batches (organization_id, installation_id, received_at)
  where signal = 'logs';

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
  model text,
  slug text,
  originator text,
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

create index prompt_events_prompt_text_trgm_idx
  on public.prompt_events using gin (prompt_text extensions.gin_trgm_ops);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.installation_setup_sessions enable row level security;
alter table public.installations enable row level security;
alter table public.telemetry_batches enable row level security;
alter table public.prompt_events enable row level security;

create policy "clients cannot access organization invitations"
  on public.organization_invitations
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "clients cannot access installation setup sessions"
  on public.installation_setup_sessions
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

create view public.human_prompt_events
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
  ) = 0;

create view public.response_usage_events
with (security_invoker = true) as
select
  batch.organization_id,
  batch.installation_id,
  batch.id as batch_id,
  batch.received_at,
  case
    when coalesce(metadata.attributes->>'event.name', record.value->>'eventName') = 'codex.sse_event'
      then 'openai'
    when record.value#>>'{body,stringValue}' = 'claude_code.api_request'
      then 'anthropic'
  end as provider,
  coalesce(
    metadata.attributes->>'conversation.id',
    metadata.attributes->>'session.id'
  ) as conversation_id,
  metadata.attributes->>'prompt.id' as prompt_id,
  metadata.attributes->>'model' as model,
  metadata.attributes->>'event.timestamp' as event_timestamp,
  record.value->>'timeUnixNano' as time_unix_nano,
  record.value->>'observedTimeUnixNano' as observed_time_unix_nano,
  coalesce(
    metadata.attributes->>'input_token_count',
    metadata.attributes->>'input_tokens'
  ) as input_token_count,
  coalesce(
    metadata.attributes->>'cached_token_count',
    metadata.attributes->>'cache_read_tokens'
  ) as cached_token_count,
  coalesce(
    metadata.attributes->>'cache_write_token_count',
    metadata.attributes->>'cache_creation_tokens'
  ) as cache_creation_token_count,
  coalesce(
    metadata.attributes->>'output_token_count',
    metadata.attributes->>'output_tokens'
  ) as output_token_count,
  metadata.attributes->>'reasoning_token_count' as reasoning_token_count,
  metadata.attributes->>'tool_token_count' as tool_token_count,
  metadata.attributes->>'cost_usd' as cost_usd,
  metadata.attributes->>'estimated_cost_usd' as estimated_cost_usd,
  metadata.attributes->>'total_cost_usd' as total_cost_usd
from public.telemetry_batches as batch
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(batch.raw_payload->'resourceLogs') = 'array'
      then batch.raw_payload->'resourceLogs'
    else '[]'::jsonb
  end
) as resource_group(value)
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(resource_group.value->'scopeLogs') = 'array'
      then resource_group.value->'scopeLogs'
    else '[]'::jsonb
  end
) as scope_group(value)
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(scope_group.value->'logRecords') = 'array'
      then scope_group.value->'logRecords'
    else '[]'::jsonb
  end
) as record(value)
cross join lateral (
  select jsonb_object_agg(
    attribute.value->>'key',
    coalesce(
      attribute.value->'value'->>'stringValue',
      attribute.value->'value'->>'intValue',
      attribute.value->'value'->>'doubleValue',
      attribute.value->'value'->>'boolValue'
    )
  ) filter (
    where jsonb_typeof(attribute.value->'key') = 'string'
  ) as attributes
  from jsonb_array_elements(
    case
      when jsonb_typeof(record.value->'attributes') = 'array'
        then record.value->'attributes'
      else '[]'::jsonb
    end
  ) as attribute(value)
) as metadata
where batch.signal = 'logs'
  and (
    (
      coalesce(metadata.attributes->>'event.name', record.value->>'eventName') = 'codex.sse_event'
      and metadata.attributes->>'event.kind' = 'response.completed'
    )
    or record.value#>>'{body,stringValue}' = 'claude_code.api_request'
  );

revoke all on table public.organizations from anon, authenticated, service_role;
revoke all on table public.organization_members from anon, authenticated, service_role;
revoke all on table public.organization_invitations from anon, authenticated, service_role;
revoke all on table public.installation_setup_sessions from anon, authenticated, service_role;
revoke all on table public.installations from anon, authenticated, service_role;
revoke all on table public.telemetry_batches from anon, authenticated, service_role;
revoke all on table public.prompt_events from anon, authenticated, service_role;
revoke all on table public.human_prompt_events from anon, authenticated, service_role;
revoke all on table public.response_usage_events from anon, authenticated, service_role;

grant select on table public.organizations to authenticated;
grant select on table public.organization_members to authenticated;
grant select on table public.installations to authenticated;
grant select on table public.prompt_events to authenticated;
grant select on table public.human_prompt_events to authenticated;

grant select, insert, update, delete on table public.organizations to service_role;
grant select, insert, update, delete on table public.organization_members to service_role;
grant select, insert, update, delete on table public.organization_invitations to service_role;
grant select, insert, update, delete on table public.installation_setup_sessions to service_role;
grant select, insert, update, delete on table public.installations to service_role;
grant select, insert, update, delete on table public.telemetry_batches to service_role;
grant select, insert, update, delete on table public.prompt_events to service_role;
grant select on table public.response_usage_events to service_role;
