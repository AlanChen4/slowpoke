begin;

select plan(43);

insert into public.organizations (
  id,
  name,
  created_by_user_id,
  idempotency_key
)
values (
  '10000000-0000-4000-8000-000000000010',
  'Empty analytics tenant',
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000011'
);

insert into public.organization_members (organization_id, user_id, role)
values (
  '10000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000002',
  'admin'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',
  true
);

select lives_ok(
  $$select public.get_prompt_analytics_summary(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    statement_timestamp()
  )$$,
  'an administrator can load the analytics summary'
);

select is(
  (
    select count(*)
    from public.get_prompt_analytics_daily(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  30::bigint,
  'daily analytics contain one zero-filled bucket per selected day'
);

select is(
  (
    select sum(prompts)::bigint
    from public.get_prompt_analytics_daily(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  (
    select current_total_prompts
    from public.get_prompt_analytics_summary(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  'daily totals equal the current prompt total'
);

select ok(
  not exists (
    select 1
    from public.get_prompt_analytics_daily_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
    where rank > 5
  ),
  'daily leaderboards contain at most five users'
);

select is(
  (
    select sum(prompts)::bigint
    from public.get_prompt_analytics_providers(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  (
    select current_total_prompts
    from public.get_prompt_analytics_summary(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  'provider totals equal the current prompt total'
);

select is(
  (
    select count(*)
    from public.get_prompt_analytics_providers(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  2::bigint,
  'provider analytics include both supported providers'
);

select ok(
  (
    select count(*)
    from public.get_prompt_analytics_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ) > 1,
  'seed data produces a multi-user leaderboard'
);

select ok(
  (
    select count(*)
    from public.get_prompt_analytics_models(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ) > 1,
  'seed data produces a multi-model breakdown'
);

select lives_ok(
  $$
    select * from public.get_prompt_analytics_summary(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      7,
      'UTC',
      statement_timestamp()
    )
    union all
    select * from public.get_prompt_analytics_summary(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/Los_Angeles',
      statement_timestamp()
    )
  $$,
  'summary analytics accept every supported range and valid timezone'
);

select lives_ok(
  $$
    select * from public.get_prompt_analytics_daily(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      7,
      'UTC',
      statement_timestamp()
    )
    union all
    select * from public.get_prompt_analytics_daily(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/Los_Angeles',
      statement_timestamp()
    )
  $$,
  'daily analytics accept every supported range and valid timezone'
);

select lives_ok(
  $$
    select * from public.get_prompt_analytics_daily_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      7,
      'UTC',
      statement_timestamp()
    )
    union all
    select * from public.get_prompt_analytics_daily_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/Los_Angeles',
      statement_timestamp()
    )
  $$,
  'daily user analytics accept every supported range and valid timezone'
);

select lives_ok(
  $$
    select * from public.get_prompt_analytics_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      7,
      'UTC',
      statement_timestamp()
    )
    union all
    select * from public.get_prompt_analytics_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/Los_Angeles',
      statement_timestamp()
    )
  $$,
  'user analytics accept every supported range and valid timezone'
);

select lives_ok(
  $$
    select * from public.get_prompt_analytics_providers(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      7,
      'UTC',
      statement_timestamp()
    )
    union all
    select * from public.get_prompt_analytics_providers(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/Los_Angeles',
      statement_timestamp()
    )
  $$,
  'provider analytics accept every supported range and valid timezone'
);

select lives_ok(
  $$
    select * from public.get_prompt_analytics_models(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      7,
      'UTC',
      statement_timestamp()
    )
    union all
    select * from public.get_prompt_analytics_models(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/Los_Angeles',
      statement_timestamp()
    )
  $$,
  'model analytics accept every supported range and valid timezone'
);

select is(
  (
    select max(day)
    from public.get_prompt_analytics_daily(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      7,
      'America/New_York',
      '2026-08-25 02:00:00+00'
    )
  ),
  '2026-08-24'::date,
  'daily buckets use the requested timezone for the reporting date'
);

select ok(
  (
    select array_agg(day) = array_agg(day order by day)
    from public.get_prompt_analytics_daily(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  'daily analytics are ordered by date ascending'
);

select ok(
  (
    select array_agg(day::text || ':' || rank::text)
      = array_agg(day::text || ':' || rank::text order by day, rank)
    from public.get_prompt_analytics_daily_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  'daily user analytics are ordered by date and rank'
);

select ok(
  (
    select array_agg(rank) = array_agg(rank order by rank)
    from public.get_prompt_analytics_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  'overall user analytics are ordered by rank'
);

select is(
  (
    select array_agg(provider)
    from public.get_prompt_analytics_providers(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York',
      statement_timestamp()
    )
  ),
  array['anthropic', 'openai']::text[],
  'provider analytics use a stable provider order'
);

select ok(
  not exists (
    select 1
    from (
      select prompts, lag(prompts) over () as previous_prompts
      from public.get_prompt_analytics_models(
        (select id from public.organizations where name = 'Slowpoke' limit 1),
        30,
        'America/New_York',
        statement_timestamp()
      )
      where model not in ('Unknown', 'Other')
    ) as ordered_models
    where ordered_models.prompts > ordered_models.previous_prompts
  ),
  'named model analytics are ordered by prompt count descending'
);

select ok(
  (
    select count(*) <= 25 and coalesce(max(rank), 0) <= 25
    from public.get_prompt_analytics_users(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  'overall user analytics are limited to 25 users'
);

select ok(
  (
    select count(*) <= 9
      and count(*) filter (where model not in ('Unknown', 'Other')) <= 7
    from public.get_prompt_analytics_models(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  'model analytics are limited to seven named models plus special buckets'
);

select is(
  (
    select current_total_prompts
    from public.get_prompt_analytics_summary(
      '10000000-0000-4000-8000-000000000010',
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  0::bigint,
  'summary analytics do not leak prompts from another tenant into an empty tenant'
);

select is(
  (
    select jsonb_build_array(count(*), coalesce(sum(prompts), 0))
    from public.get_prompt_analytics_daily(
      '10000000-0000-4000-8000-000000000010',
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  '[90, 0]'::jsonb,
  'daily analytics return zero-filled buckets without cross-tenant activity'
);

select is(
  (
    select count(*)
    from public.get_prompt_analytics_daily_users(
      '10000000-0000-4000-8000-000000000010',
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  0::bigint,
  'daily user analytics return an empty tenant-scoped result'
);

select is(
  (
    select count(*)
    from public.get_prompt_analytics_users(
      '10000000-0000-4000-8000-000000000010',
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  0::bigint,
  'overall user analytics return an empty tenant-scoped result'
);

select is(
  (
    select jsonb_object_agg(provider, prompts)
    from public.get_prompt_analytics_providers(
      '10000000-0000-4000-8000-000000000010',
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  '{"anthropic": 0, "openai": 0}'::jsonb,
  'provider analytics return zero-filled tenant-scoped buckets'
);

select is(
  (
    select count(*)
    from public.get_prompt_analytics_models(
      '10000000-0000-4000-8000-000000000010',
      90,
      'America/New_York',
      statement_timestamp()
    )
  ),
  0::bigint,
  'model analytics return an empty tenant-scoped result'
);

select throws_ok(
  $$select public.get_prompt_analytics_summary(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    14,
    'America/New_York',
    statement_timestamp()
  )$$,
  '22023',
  'Analytics range must be 7, 30, or 90 days.',
  'unsupported analytics ranges are rejected'
);

select throws_ok(
  $$select public.get_prompt_analytics_daily(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'Not/A_Timezone',
    statement_timestamp()
  )$$,
  '22023',
  'Analytics timezone is invalid.',
  'invalid analytics timezones are rejected'
);

select throws_ok(
  $$select public.get_prompt_analytics_users(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    null
  )$$,
  '22023',
  'Analytics end time is required.',
  'null analytics end times are rejected'
);

reset role;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000009', 'member@slowpoke.ai');

insert into public.organization_members (organization_id, user_id, role)
select id, '00000000-0000-4000-8000-000000000009', 'member'
from public.organizations
where name = 'Slowpoke'
limit 1;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000009',
  true
);

select throws_ok(
  $$select public.get_prompt_analytics_summary(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    statement_timestamp()
  )$$,
  '42501',
  'Analytics are available only to organization administrators.',
  'members cannot load organization analytics'
);

select throws_ok(
  $$select public.get_prompt_analytics_daily(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    statement_timestamp()
  )$$,
  '42501',
  'Analytics are available only to organization administrators.',
  'members cannot load daily organization analytics'
);

select throws_ok(
  $$select public.get_prompt_analytics_daily_users(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    statement_timestamp()
  )$$,
  '42501',
  'Analytics are available only to organization administrators.',
  'members cannot load daily user analytics'
);

select throws_ok(
  $$select public.get_prompt_analytics_users(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    statement_timestamp()
  )$$,
  '42501',
  'Analytics are available only to organization administrators.',
  'members cannot load user analytics'
);

select throws_ok(
  $$select public.get_prompt_analytics_providers(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    statement_timestamp()
  )$$,
  '42501',
  'Analytics are available only to organization administrators.',
  'members cannot load provider analytics'
);

select throws_ok(
  $$select public.get_prompt_analytics_models(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York',
    statement_timestamp()
  )$$,
  '42501',
  'Analytics are available only to organization administrators.',
  'members cannot load model analytics'
);

set local role anon;

select throws_ok(
  $$select public.get_prompt_analytics_summary(null::uuid, 30, 'America/New_York', statement_timestamp())$$,
  '42501',
  'permission denied for function get_prompt_analytics_summary',
  'anonymous clients cannot execute the analytics summary function'
);

select throws_ok(
  $$select public.get_prompt_analytics_daily(null::uuid, 30, 'America/New_York', statement_timestamp())$$,
  '42501',
  'permission denied for function get_prompt_analytics_daily',
  'anonymous clients cannot execute the daily analytics function'
);

select throws_ok(
  $$select public.get_prompt_analytics_daily_users(null::uuid, 30, 'America/New_York', statement_timestamp())$$,
  '42501',
  'permission denied for function get_prompt_analytics_daily_users',
  'anonymous clients cannot execute the daily user analytics function'
);

select throws_ok(
  $$select public.get_prompt_analytics_users(null::uuid, 30, 'America/New_York', statement_timestamp())$$,
  '42501',
  'permission denied for function get_prompt_analytics_users',
  'anonymous clients cannot execute the user analytics function'
);

select throws_ok(
  $$select public.get_prompt_analytics_providers(null::uuid, 30, 'America/New_York', statement_timestamp())$$,
  '42501',
  'permission denied for function get_prompt_analytics_providers',
  'anonymous clients cannot execute the provider analytics function'
);

select throws_ok(
  $$select public.get_prompt_analytics_models(null::uuid, 30, 'America/New_York', statement_timestamp())$$,
  '42501',
  'permission denied for function get_prompt_analytics_models',
  'anonymous clients cannot execute the model analytics function'
);

select * from finish();
rollback;
