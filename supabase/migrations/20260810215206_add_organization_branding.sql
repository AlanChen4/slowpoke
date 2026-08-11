-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_name_check CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80);

ALTER TABLE public.organizations
  ADD COLUMN logo_url text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_logo_url_check CHECK (logo_url IS NULL OR char_length(logo_url) <= 2048);

GRANT UPDATE (logo_url, name) ON public.organizations TO authenticated;

CREATE POLICY "admins can update their organizations" ON public.organizations
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE ((membership.organization_id = organizations.id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE ((membership.organization_id = organizations.id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'admin'::text)))));

UPDATE public.organizations
SET name = 'Slowpoke'
WHERE name = 'Slowblink';
