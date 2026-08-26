-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.get_prompt_analytics (
  p_organization_id uuid,
  p_days            integer,
  p_timezone        text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path TO ''
  AS $function$
declare
  current_end timestamptz := statement_timestamp();
  current_start timestamptz;
  previous_start timestamptz;
  result jsonb;
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
    date_trunc('day', current_end at time zone p_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone p_timezone;
  previous_start := current_start - (current_end - current_start);

  with events as (
    select
      prompt.occurred_at,
      prompt.provider,
      coalesce(nullif(trim(prompt.model), ''), 'Unknown') as model,
      case
        when nullif(trim(prompt.actor_email), '') is not null
          then 'email:' || lower(trim(prompt.actor_email))
        when nullif(trim(prompt.actor_account_id), '') is not null
          then 'account:' || trim(prompt.actor_account_id)
      end as user_key,
      coalesce(
        lower(nullif(trim(prompt.actor_email), '')),
        nullif(trim(prompt.actor_account_id), ''),
        'Unknown user'
      ) as user_label
    from public.human_prompt_events as prompt
    where prompt.organization_id = p_organization_id
      and prompt.occurred_at >= previous_start
      and prompt.occurred_at <= current_end
  ),
  totals as (
    select
      count(*) filter (where occurred_at >= current_start) as current_prompts,
      count(distinct user_key) filter (
        where occurred_at >= current_start and user_key is not null
      ) as current_users,
      count(*) filter (where occurred_at < current_start) as previous_prompts,
      count(distinct user_key) filter (
        where occurred_at < current_start and user_key is not null
      ) as previous_users
    from events
  ),
  day_series as (
    select day::date
    from generate_series(
      (current_start at time zone p_timezone)::date,
      (current_end at time zone p_timezone)::date,
      interval '1 day'
    ) as day
  ),
  daily_counts as (
    select
      (occurred_at at time zone p_timezone)::date as day,
      count(*) as prompts,
      count(distinct user_key) filter (where user_key is not null) as active_users,
      count(*) filter (where provider = 'openai') as openai,
      count(*) filter (where provider = 'anthropic') as anthropic
    from events
    where occurred_at >= current_start
    group by 1
  ),
  daily_user_counts as (
    select
      (occurred_at at time zone p_timezone)::date as day,
      coalesce(user_key, 'unknown') as user_key,
      user_label,
      count(*) as prompts
    from events
    where occurred_at >= current_start
    group by 1, 2, 3
  ),
  ranked_daily_users as (
    select
      day,
      user_key,
      user_label,
      prompts,
      row_number() over (
        partition by day
        order by prompts desc, user_label
      ) as day_rank
    from daily_user_counts
  ),
  daily_users_json as (
    select
      day,
      jsonb_agg(
        jsonb_build_object(
          'rank', day_rank,
          'key', user_key,
          'label', user_label,
          'prompts', prompts
        )
        order by day_rank
      ) filter (where day_rank <= 5) as users
    from ranked_daily_users
    group by day
  ),
  daily_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', day_series.day,
          'prompts', coalesce(daily_counts.prompts, 0),
          'activeUsers', coalesce(daily_counts.active_users, 0),
          'openai', coalesce(daily_counts.openai, 0),
          'anthropic', coalesce(daily_counts.anthropic, 0),
          'users', coalesce(daily_users_json.users, '[]'::jsonb)
        )
        order by day_series.day
      ),
      '[]'::jsonb
    ) as value
    from day_series
    left join daily_counts using (day)
    left join daily_users_json using (day)
  ),
  user_counts as (
    select
      coalesce(user_key, 'unknown') as user_key,
      user_label,
      count(*) as prompts,
      max(occurred_at) as last_active_at
    from events
    where occurred_at >= current_start
    group by 1, 2
  ),
  ranked_users as (
    select
      row_number() over (order by prompts desc, user_label) as rank,
      user_key,
      user_label,
      prompts,
      last_active_at
    from user_counts
  ),
  users_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank', rank,
          'key', user_key,
          'label', user_label,
          'prompts', prompts,
          'share', case
            when totals.current_prompts = 0 then 0
            else round(prompts::numeric / totals.current_prompts, 4)
          end,
          'lastActiveAt', last_active_at
        )
        order by rank
      ) filter (where rank <= 25),
      '[]'::jsonb
    ) as value
    from ranked_users
    cross join totals
  ),
  provider_series(provider) as (
    values ('openai'::text), ('anthropic'::text)
  ),
  provider_counts as (
    select provider, count(*) as prompts
    from events
    where occurred_at >= current_start
    group by provider
  ),
  providers_json as (
    select jsonb_agg(
      jsonb_build_object(
        'provider', provider_series.provider,
        'prompts', coalesce(provider_counts.prompts, 0)
      )
      order by provider_series.provider
    ) as value
    from provider_series
    left join provider_counts using (provider)
  ),
  model_counts as (
    select model, count(*) as prompts
    from events
    where occurred_at >= current_start
    group by model
  ),
  ranked_models as (
    select
      model,
      prompts,
      row_number() over (order by prompts desc, model) filter_model_rank
    from model_counts
    where model <> 'Unknown'
  ),
  model_buckets as (
    select model, prompts, filter_model_rank as sort_order
    from ranked_models
    where filter_model_rank <= 7

    union all

    select 'Unknown', prompts, 8
    from model_counts
    where model = 'Unknown'

    union all

    select 'Other', sum(prompts), 9
    from ranked_models
    where filter_model_rank > 7
    having count(*) > 0
  ),
  models_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('model', model, 'prompts', prompts)
        order by sort_order, model
      ),
      '[]'::jsonb
    ) as value
    from model_buckets
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'current', jsonb_build_object(
        'totalPrompts', totals.current_prompts,
        'activeUsers', totals.current_users,
        'promptsPerDay', round(totals.current_prompts::numeric / p_days, 2),
        'promptsPerUser', case
          when totals.current_users = 0 then 0
          else round(totals.current_prompts::numeric / totals.current_users, 2)
        end
      ),
      'previous', jsonb_build_object(
        'totalPrompts', totals.previous_prompts,
        'activeUsers', totals.previous_users,
        'promptsPerDay', round(totals.previous_prompts::numeric / p_days, 2),
        'promptsPerUser', case
          when totals.previous_users = 0 then 0
          else round(totals.previous_prompts::numeric / totals.previous_users, 2)
        end
      )
    ),
    'daily', daily_json.value,
    'users', users_json.value,
    'providers', providers_json.value,
    'models', models_json.value
  )
  into result
  from totals
  cross join daily_json
  cross join users_json
  cross join providers_json
  cross join models_json;

  return result;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_prompt_analytics(uuid, integer, text)
  FROM public, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_prompt_analytics(uuid, integer, text) TO authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.response_usage_events FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.response_usage_events FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.response_usage_events FROM service_role;
