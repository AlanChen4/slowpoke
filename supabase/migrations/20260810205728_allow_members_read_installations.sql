grant select on table public.installations to authenticated;

create policy "members can read organization installations"
  on public.installations
  for select
  to authenticated
  using (
    organization_id in (
      select membership.organization_id
      from public.organization_members as membership
      where membership.user_id = (select auth.uid())
    )
  );
