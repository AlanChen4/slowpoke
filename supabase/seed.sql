-- Stable local installation used by the development Collector credentials.
insert into public.organizations (name)
select 'Local Development'
where not exists (
  select 1
  from public.organizations
  where name = 'Local Development'
);

insert into public.installations (organization_id, collector_id)
select
  id,
  '00000000-0000-4000-8000-000000000001'
from public.organizations
where name = 'Local Development'
order by id
limit 1
on conflict (collector_id) do nothing;
