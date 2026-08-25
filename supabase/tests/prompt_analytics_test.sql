begin;

select plan(23);

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
