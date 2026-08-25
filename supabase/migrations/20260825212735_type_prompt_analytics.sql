-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.get_prompt_analytics(p_organization_id uuid, p_days integer, p_timezone text);

CREATE FUNCTION public.get_prompt_analytics_daily_users (
  p_organization_id uuid,
  p_days            integer,
  p_timezone        text,
  p_end             timestamp with time zone
)
  RETURNS TABLE (
    day        date,
    rank       bigint,
    user_key   text,
    user_label text,
    prompts    bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  current_start timestamptz;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception using
      errcode = '22023',
      message = 'Analytics range must be 7, 30, or 90 days.';
  end if;

  if p_timezone is null
    or char_length(p_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Analytics timezone is invalid.';
  end if;

  if p_end is null then
    raise exception using
      errcode = '22023',
      message = 'Analytics end time is required.';
  end if;

  if (select auth.uid()) is null or not exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Analytics are available only to organization administrators.';
  end if;

  current_start := (
    date_trunc('day', p_end at time zone p_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone p_timezone;

  return query
  with daily_user_counts as (
    select
      (prompt.occurred_at at time zone p_timezone)::date as day,
      coalesce(
        case
          when nullif(trim(prompt.actor_email), '') is not null
            then 'email:' || lower(trim(prompt.actor_email))
          when nullif(trim(prompt.actor_account_id), '') is not null
            then 'account:' || trim(prompt.actor_account_id)
        end,
        'unknown'
      ) as user_key,
      coalesce(
        lower(nullif(trim(prompt.actor_email), '')),
        nullif(trim(prompt.actor_account_id), ''),
        'Unknown user'
      ) as user_label,
      count(*) as prompts
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= current_start
      and prompt.occurred_at <= p_end
    group by 1, 2, 3
  ),
  ranked_daily_users as (
    select
      daily_user_counts.day,
      daily_user_counts.user_key,
      daily_user_counts.user_label,
      daily_user_counts.prompts,
      row_number() over (
        partition by daily_user_counts.day
        order by daily_user_counts.prompts desc, daily_user_counts.user_label
      ) as rank
    from daily_user_counts
  )
  select
    ranked_daily_users.day,
    ranked_daily_users.rank,
    ranked_daily_users.user_key,
    ranked_daily_users.user_label,
    ranked_daily_users.prompts
  from ranked_daily_users
  where ranked_daily_users.rank <= 5
  order by ranked_daily_users.day, ranked_daily_users.rank;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_prompt_analytics_daily_users(uuid, integer, text, timestamp WITH time zone) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_prompt_analytics_daily_users(uuid, integer, text, timestamp WITH time zone) TO authenticated;

CREATE FUNCTION public.get_prompt_analytics_daily (
  p_organization_id uuid,
  p_days            integer,
  p_timezone        text,
  p_end             timestamp with time zone
)
  RETURNS TABLE (
    day          date,
    prompts      bigint,
    active_users bigint,
    openai       bigint,
    anthropic    bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  current_start timestamptz;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception using
      errcode = '22023',
      message = 'Analytics range must be 7, 30, or 90 days.';
  end if;

  if p_timezone is null
    or char_length(p_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Analytics timezone is invalid.';
  end if;

  if p_end is null then
    raise exception using
      errcode = '22023',
      message = 'Analytics end time is required.';
  end if;

  if (select auth.uid()) is null or not exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Analytics are available only to organization administrators.';
  end if;

  current_start := (
    date_trunc('day', p_end at time zone p_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone p_timezone;

  return query
  with events as (
    select
      prompt.occurred_at,
      prompt.provider,
      case
        when nullif(trim(prompt.actor_email), '') is not null
          then 'email:' || lower(trim(prompt.actor_email))
        when nullif(trim(prompt.actor_account_id), '') is not null
          then 'account:' || trim(prompt.actor_account_id)
      end as user_key
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= current_start
      and prompt.occurred_at <= p_end
  ),
  day_series as (
    select generated_day::date as day
    from generate_series(
      (current_start at time zone p_timezone)::date,
      (p_end at time zone p_timezone)::date,
      interval '1 day'
    ) as generated_day
  ),
  daily_counts as (
    select
      (events.occurred_at at time zone p_timezone)::date as day,
      count(*) as prompts,
      count(distinct events.user_key) filter (where events.user_key is not null) as active_users,
      count(*) filter (where events.provider = 'openai') as openai,
      count(*) filter (where events.provider = 'anthropic') as anthropic
    from events
    group by 1
  )
  select
    day_series.day,
    coalesce(daily_counts.prompts, 0),
    coalesce(daily_counts.active_users, 0),
    coalesce(daily_counts.openai, 0),
    coalesce(daily_counts.anthropic, 0)
  from day_series
  left join daily_counts on daily_counts.day = day_series.day
  order by day_series.day;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_prompt_analytics_daily(uuid, integer, text, timestamp WITH time zone) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_prompt_analytics_daily(uuid, integer, text, timestamp WITH time zone) TO authenticated;

CREATE FUNCTION public.get_prompt_analytics_models (
  p_organization_id uuid,
  p_days            integer,
  p_timezone        text,
  p_end             timestamp with time zone
)
  RETURNS TABLE (
    model   text,
    prompts bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  current_start timestamptz;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception using
      errcode = '22023',
      message = 'Analytics range must be 7, 30, or 90 days.';
  end if;

  if p_timezone is null
    or char_length(p_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Analytics timezone is invalid.';
  end if;

  if p_end is null then
    raise exception using
      errcode = '22023',
      message = 'Analytics end time is required.';
  end if;

  if (select auth.uid()) is null or not exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Analytics are available only to organization administrators.';
  end if;

  current_start := (
    date_trunc('day', p_end at time zone p_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone p_timezone;

  return query
  with model_counts as (
    select
      coalesce(nullif(trim(prompt.model), ''), 'Unknown') as model,
      count(*) as prompts
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= current_start
      and prompt.occurred_at <= p_end
    group by 1
  ),
  ranked_models as (
    select
      model_counts.model,
      model_counts.prompts,
      row_number() over (
        order by model_counts.prompts desc, model_counts.model
      ) as filter_model_rank
    from model_counts
    where model_counts.model <> 'Unknown'
  ),
  model_buckets as (
    select
      ranked_models.model,
      ranked_models.prompts,
      ranked_models.filter_model_rank as sort_order
    from ranked_models
    where ranked_models.filter_model_rank <= 7

    union all

    select model_counts.model, model_counts.prompts, 8
    from model_counts
    where model_counts.model = 'Unknown'

    union all

    select 'Other', sum(ranked_models.prompts)::bigint, 9
    from ranked_models
    where ranked_models.filter_model_rank > 7
    having count(*) > 0
  )
  select model_buckets.model, model_buckets.prompts
  from model_buckets
  order by model_buckets.sort_order, model_buckets.model;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_prompt_analytics_models(uuid, integer, text, timestamp WITH time zone) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_prompt_analytics_models(uuid, integer, text, timestamp WITH time zone) TO authenticated;

CREATE FUNCTION public.get_prompt_analytics_providers (
  p_organization_id uuid,
  p_days            integer,
  p_timezone        text,
  p_end             timestamp with time zone
)
  RETURNS TABLE (
    provider text,
    prompts  bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  current_start timestamptz;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception using
      errcode = '22023',
      message = 'Analytics range must be 7, 30, or 90 days.';
  end if;

  if p_timezone is null
    or char_length(p_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Analytics timezone is invalid.';
  end if;

  if p_end is null then
    raise exception using
      errcode = '22023',
      message = 'Analytics end time is required.';
  end if;

  if (select auth.uid()) is null or not exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Analytics are available only to organization administrators.';
  end if;

  current_start := (
    date_trunc('day', p_end at time zone p_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone p_timezone;

  return query
  with provider_series(provider) as (
    values ('anthropic'::text), ('openai'::text)
  ),
  provider_counts as (
    select prompt.provider, count(*) as prompts
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= current_start
      and prompt.occurred_at <= p_end
    group by prompt.provider
  )
  select
    provider_series.provider,
    coalesce(provider_counts.prompts, 0)
  from provider_series
  left join provider_counts on provider_counts.provider = provider_series.provider
  order by provider_series.provider;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_prompt_analytics_providers(uuid, integer, text, timestamp WITH time zone) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_prompt_analytics_providers(uuid, integer, text, timestamp WITH time zone) TO authenticated;

CREATE FUNCTION public.get_prompt_analytics_summary (
  p_organization_id uuid,
  p_days            integer,
  p_timezone        text,
  p_end             timestamp with time zone
)
  RETURNS TABLE (
    current_total_prompts     bigint,
    current_active_users      bigint,
    current_prompts_per_day   numeric,
    current_prompts_per_user  numeric,
    previous_total_prompts    bigint,
    previous_active_users     bigint,
    previous_prompts_per_day  numeric,
    previous_prompts_per_user numeric
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  current_start timestamptz;
  previous_start timestamptz;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception using
      errcode = '22023',
      message = 'Analytics range must be 7, 30, or 90 days.';
  end if;

  if p_timezone is null
    or char_length(p_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Analytics timezone is invalid.';
  end if;

  if p_end is null then
    raise exception using
      errcode = '22023',
      message = 'Analytics end time is required.';
  end if;

  if (select auth.uid()) is null or not exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Analytics are available only to organization administrators.';
  end if;

  current_start := (
    date_trunc('day', p_end at time zone p_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone p_timezone;
  previous_start := current_start - (p_end - current_start);

  return query
  with events as (
    select
      prompt.occurred_at,
      case
        when nullif(trim(prompt.actor_email), '') is not null
          then 'email:' || lower(trim(prompt.actor_email))
        when nullif(trim(prompt.actor_account_id), '') is not null
          then 'account:' || trim(prompt.actor_account_id)
      end as user_key
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= previous_start
      and prompt.occurred_at <= p_end
  ),
  totals as (
    select
      count(*) filter (where events.occurred_at >= current_start) as current_prompts,
      count(distinct events.user_key) filter (
        where events.occurred_at >= current_start and events.user_key is not null
      ) as current_users,
      count(*) filter (where events.occurred_at < current_start) as previous_prompts,
      count(distinct events.user_key) filter (
        where events.occurred_at < current_start and events.user_key is not null
      ) as previous_users
    from events
  )
  select
    totals.current_prompts,
    totals.current_users,
    round(totals.current_prompts::numeric / p_days, 2),
    case
      when totals.current_users = 0 then 0
      else round(totals.current_prompts::numeric / totals.current_users, 2)
    end,
    totals.previous_prompts,
    totals.previous_users,
    round(totals.previous_prompts::numeric / p_days, 2),
    case
      when totals.previous_users = 0 then 0
      else round(totals.previous_prompts::numeric / totals.previous_users, 2)
    end
  from totals;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_prompt_analytics_summary(uuid, integer, text, timestamp WITH time zone) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_prompt_analytics_summary(uuid, integer, text, timestamp WITH time zone) TO authenticated;

CREATE FUNCTION public.get_prompt_analytics_users (
  p_organization_id uuid,
  p_days            integer,
  p_timezone        text,
  p_end             timestamp with time zone
)
  RETURNS TABLE (
    rank           bigint,
    user_key       text,
    user_label     text,
    prompts        bigint,
    share          numeric,
    last_active_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  current_start timestamptz;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception using
      errcode = '22023',
      message = 'Analytics range must be 7, 30, or 90 days.';
  end if;

  if p_timezone is null
    or char_length(p_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Analytics timezone is invalid.';
  end if;

  if p_end is null then
    raise exception using
      errcode = '22023',
      message = 'Analytics end time is required.';
  end if;

  if (select auth.uid()) is null or not exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Analytics are available only to organization administrators.';
  end if;

  current_start := (
    date_trunc('day', p_end at time zone p_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone p_timezone;

  return query
  with user_counts as (
    select
      coalesce(
        case
          when nullif(trim(prompt.actor_email), '') is not null
            then 'email:' || lower(trim(prompt.actor_email))
          when nullif(trim(prompt.actor_account_id), '') is not null
            then 'account:' || trim(prompt.actor_account_id)
        end,
        'unknown'
      ) as user_key,
      coalesce(
        lower(nullif(trim(prompt.actor_email), '')),
        nullif(trim(prompt.actor_account_id), ''),
        'Unknown user'
      ) as user_label,
      count(*) as prompts,
      max(prompt.occurred_at) as last_active_at
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= current_start
      and prompt.occurred_at <= p_end
    group by 1, 2
  ),
  totals as (
    select count(*) as prompts
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= current_start
      and prompt.occurred_at <= p_end
  ),
  ranked_users as (
    select
      row_number() over (
        order by user_counts.prompts desc, user_counts.user_label
      ) as rank,
      user_counts.user_key,
      user_counts.user_label,
      user_counts.prompts,
      user_counts.last_active_at
    from user_counts
  )
  select
    ranked_users.rank,
    ranked_users.user_key,
    ranked_users.user_label,
    ranked_users.prompts,
    case
      when totals.prompts = 0 then 0
      else round(ranked_users.prompts::numeric / totals.prompts, 4)
    end,
    ranked_users.last_active_at
  from ranked_users
  cross join totals
  where ranked_users.rank <= 25
  order by ranked_users.rank;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_prompt_analytics_users(uuid, integer, text, timestamp WITH time zone) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_prompt_analytics_users(uuid, integer, text, timestamp WITH time zone) TO authenticated;
