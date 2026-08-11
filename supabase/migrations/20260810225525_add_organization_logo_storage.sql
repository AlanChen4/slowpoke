create policy "organization admins can read logo objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.role = 'admin'
    )
  );

create policy "organization admins can upload logo objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'organization-logos'
    and exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.role = 'admin'
    )
  );

create policy "organization admins can replace logo objects"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.role = 'admin'
    )
  )
  with check (
    bucket_id = 'organization-logos'
    and exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.role = 'admin'
    )
  );
