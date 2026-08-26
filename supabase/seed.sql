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

with seed_organization as (
  select organization.id
  from public.organizations as organization
  where organization.name = 'Slowpoke'
  order by organization.id
  limit 1
),
daily_activity as (
  select
    day_offset,
    current_date - day_offset as activity_day,
    case
      when day_offset in (6, 17, 43, 72, 109, 144, 165) then 0
      else greatest(
        0,
        case extract(isodow from current_date - day_offset)::integer
          when 1 then 8
          when 2 then 10
          when 3 then 11
          when 4 then 9
          when 5 then 7
          when 6 then 3
          else 2
        end
        + (day_offset * 7) % 5 - 2
        + case
          when day_offset <= 30 then 2
          when day_offset <= 90 then 1
          else 0
        end
        + case when day_offset % 31 = 0 then 7 else 0 end
      )
    end as prompt_count
  from generate_series(1, 180) as offsets(day_offset)
),
samples as (
  select
    row_number() over (order by daily_activity.day_offset desc, event.index_within_day)::integer
      - 1 as sample_index,
    daily_activity.day_offset,
    daily_activity.activity_day,
    event.index_within_day,
    (daily_activity.day_offset * 13 + event.index_within_day * 17) % 100 as user_bucket,
    case
      when (daily_activity.day_offset + event.index_within_day) % 10 < 4
        then 'anthropic'
      else 'openai'
    end as provider
  from daily_activity
  cross join lateral generate_series(1, daily_activity.prompt_count) as event(index_within_day)
)
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
  case when sample.provider = 'anthropic'
    then '50000000-0000-4000-8000-000000000002'::uuid
    else '50000000-0000-4000-8000-000000000001'::uuid
  end,
  case when sample.provider = 'anthropic'
    then '52000000-0000-4000-8000-000000000002'::uuid
    else '52000000-0000-4000-8000-000000000001'::uuid
  end,
  sample.sample_index,
  sample.provider,
  case
    when sample.provider = 'anthropic' then 'claude_code.user_prompt'
    else 'codex.user_prompt'
  end,
  sample.activity_day::timestamptz
    + make_interval(hours => 7 + (sample.index_within_day * 3 + sample.day_offset) % 13)
    + make_interval(mins => (sample.index_within_day * 17 + sample.day_offset * 11) % 60),
  'demo-prompt-' || sample.sample_index,
  'demo-session-' || sample.day_offset || '-' || (sample.index_within_day - 1) / 4,
  case when sample.user_bucket >= 96 then 'account-' || sample.user_bucket % 3 end,
  case
    when sample.user_bucket < 20 then 'taylor@slowpoke.ai'
    when sample.user_bucket < 36 then 'casey@slowpoke.ai'
    when sample.user_bucket < 50 then 'alex@slowpoke.ai'
    when sample.user_bucket < 62 then 'jordan@slowpoke.ai'
    when sample.user_bucket < 72 then 'dev@slowpoke.ai'
    when sample.user_bucket < 80 then 'morgan@slowpoke.ai'
    when sample.user_bucket < 87 then 'riley@slowpoke.ai'
    when sample.user_bucket < 92 then 'sam@slowpoke.ai'
    else null
  end,
  case (sample.day_offset + sample.index_within_day) % 5
    when 0 then 'Summarize customer feedback and identify recurring themes.'
    when 1 then 'Draft a concise implementation plan for the next product change.'
    when 2 then 'Review this code path for correctness, security, and maintainability.'
    when 3 then 'Turn these notes into a clear status update for the team.'
    else 'Analyze the latest support trends and recommend follow-up actions.'
  end,
  sample.sample_index % 29 = 0,
  case
    when sample.provider = 'anthropic' and sample.sample_index % 5 = 0 then 'claude-opus-4-1'
    when sample.provider = 'anthropic' then 'claude-sonnet-4-5'
    when sample.sample_index % 11 = 0 then null
    when sample.sample_index % 7 = 0 then 'gpt-5.2-codex'
    when sample.sample_index % 5 = 0 then 'gpt-5.1-codex-mini'
    else 'gpt-5.3-codex'
  end,
  case when sample.provider = 'anthropic' then 'claude-code' else 'codex' end
from seed_organization as organization
cross join samples as sample
on conflict (batch_id, record_index) do nothing;
