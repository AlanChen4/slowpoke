begin;

select plan(11);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',
  true
);

select lives_ok(
  $$select public.get_prompt_analytics(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York'
  )$$,
  'an administrator can load prompt analytics'
);

select is(
  jsonb_array_length(
    public.get_prompt_analytics(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York'
    )->'daily'
  ),
  30,
  'daily analytics contain one zero-filled bucket per selected day'
);

select is(
  (
    select sum((day->>'prompts')::integer)
    from jsonb_array_elements(
      public.get_prompt_analytics(
        (select id from public.organizations where name = 'Slowpoke' limit 1),
        30,
        'America/New_York'
      )->'daily'
    ) as day
  ),
  (
    public.get_prompt_analytics(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York'
    )#>>'{summary,current,totalPrompts}'
  )::bigint,
  'daily totals equal the current prompt total'
);

select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.get_prompt_analytics(
        (select id from public.organizations where name = 'Slowpoke' limit 1),
        30,
        'America/New_York'
      )->'daily'
    ) as day
    where jsonb_array_length(day->'users') > 5
  ),
  'daily leaderboards contain at most five users'
);

select is(
  (
    select sum((provider->>'prompts')::integer)
    from jsonb_array_elements(
      public.get_prompt_analytics(
        (select id from public.organizations where name = 'Slowpoke' limit 1),
        30,
        'America/New_York'
      )->'providers'
    ) as provider
  ),
  (
    public.get_prompt_analytics(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York'
    )#>>'{summary,current,totalPrompts}'
  )::bigint,
  'provider totals equal the current prompt total'
);

select ok(
  jsonb_array_length(
    public.get_prompt_analytics(
      (select id from public.organizations where name = 'Slowpoke' limit 1),
      30,
      'America/New_York'
    )->'users'
  ) > 1,
  'seed data produces a multi-user leaderboard'
);

select throws_ok(
  $$select public.get_prompt_analytics(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    14,
    'America/New_York'
  )$$,
  '22023',
  'Analytics range must be 7, 30, or 90 days.',
  'unsupported analytics ranges are rejected'
);

select throws_ok(
  $$select public.get_prompt_analytics(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    null,
    'America/New_York'
  )$$,
  '22023',
  'Analytics range must be 7, 30, or 90 days.',
  'null analytics ranges are rejected'
);

select throws_ok(
  $$select public.get_prompt_analytics(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'Not/A_Timezone'
  )$$,
  '22023',
  'Analytics timezone is invalid.',
  'invalid analytics timezones are rejected'
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
  $$select public.get_prompt_analytics(
    (select id from public.organizations where name = 'Slowpoke' limit 1),
    30,
    'America/New_York'
  )$$,
  '42501',
  'Analytics are available only to organization administrators.',
  'members cannot load organization analytics'
);

set local role anon;

select throws_ok(
  $$select public.get_prompt_analytics(
    null::uuid,
    30,
    'America/New_York'
  )$$,
  '42501',
  'permission denied for function get_prompt_analytics',
  'anonymous clients cannot execute the analytics function'
);

select * from finish();
rollback;
