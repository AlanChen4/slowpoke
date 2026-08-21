-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.installation_setup_sessions
  ADD COLUMN installation_type text DEFAULT 'personal'::text NOT NULL;

ALTER TABLE public.installation_setup_sessions
  ADD CONSTRAINT installation_setup_sessions_check
    CHECK (installation_type = 'personal'::text OR selected_tools = ARRAY['codex'::text] OR selected_tools = ARRAY['claude_code'::text]);

ALTER TABLE public.installation_setup_sessions
  ADD CONSTRAINT installation_setup_sessions_installation_type_check CHECK (installation_type = ANY (ARRAY['personal'::text, 'team'::text]));

ALTER TABLE public.installations
  ADD COLUMN installation_type text DEFAULT 'personal'::text NOT NULL;

ALTER TABLE public.installations
  ADD CONSTRAINT installations_installation_type_check CHECK (installation_type = ANY (ARRAY['personal'::text, 'team'::text]));

CREATE UNIQUE INDEX installations_active_team_organization_idx ON public.installations (organization_id)
  WHERE installation_type = 'team'::text AND revoked_at IS NULL;

ALTER POLICY "members can read allowed installations" ON public.installations USING ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE
    ((membership.organization_id = installations.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND ((membership.role = 'admin'::text) OR
    ((installations.installation_type = 'personal'::text) AND (installations.created_by_user_id = ( SELECT auth.uid() AS uid))))))));

ALTER POLICY "members can read allowed prompts" ON public.prompt_events USING ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE
    ((membership.organization_id = prompt_events.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND ((membership.role = 'admin'::text) OR (EXISTS ( SELECT
    1
           FROM public.installations installation
          WHERE
            ((installation.id = prompt_events.installation_id) AND (installation.organization_id = prompt_events.organization_id) AND (installation.installation_type =
            'personal'::text) AND (installation.created_by_user_id = ( SELECT auth.uid() AS uid))))))))));
