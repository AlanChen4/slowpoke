-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.installation_setup_sessions
  ADD COLUMN installation_type text DEFAULT 'personal'::text NOT NULL;

ALTER TABLE public.installation_setup_sessions
  ADD CONSTRAINT installation_setup_sessions_installation_type_check CHECK (installation_type = ANY (ARRAY['personal'::text, 'team'::text]));

ALTER TABLE public.installation_setup_sessions
  ADD COLUMN team_name text;

ALTER TABLE public.installation_setup_sessions
  ADD CONSTRAINT installation_setup_sessions_check
    CHECK
    (installation_type = 'personal'::text AND team_name IS NULL OR installation_type = 'team'::text AND selected_tools = ARRAY['claude_code'::text] AND team_name IS NOT NULL AND team_name = TRIM(BOTH FROM
    team_name) AND char_length(team_name) >= 1 AND char_length(team_name) <= 80);

ALTER TABLE public.installations
  ADD COLUMN installation_type text DEFAULT 'personal'::text NOT NULL;

ALTER TABLE public.installations
  ADD CONSTRAINT installations_installation_type_check CHECK (installation_type = ANY (ARRAY['personal'::text, 'team'::text]));

ALTER TABLE public.installations
  ADD COLUMN team_name text;

ALTER TABLE public.installations
  ADD CONSTRAINT installations_check
    CHECK
    (installation_type = 'personal'::text AND team_name IS NULL OR installation_type = 'team'::text AND tool = 'claude_code'::text AND team_name IS NOT NULL AND team_name = TRIM(BOTH FROM team_name) AND
    char_length(team_name) >= 1 AND char_length(team_name) <= 80);

CREATE UNIQUE INDEX installations_active_team_name_idx ON public.installations (organization_id, lower(team_name))
  WHERE installation_type = 'team'::text AND revoked_at IS NULL;

drop policy "members can read allowed installations" on public.installations;

create policy "members can read allowed installations"
  on public.installations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = installations.organization_id
        and membership.user_id = (select auth.uid())
        and (
          membership.role = 'admin'
          or (
            installations.installation_type = 'personal'
            and installations.created_by_user_id = (select auth.uid())
          )
        )
    )
  );

drop policy "members can read allowed prompts" on public.prompt_events;

create policy "members can read allowed prompts"
  on public.prompt_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = prompt_events.organization_id
        and membership.user_id = (select auth.uid())
        and (
          membership.role = 'admin'
          or exists (
            select 1
            from public.installations as installation
            where installation.id = prompt_events.installation_id
              and installation.organization_id = prompt_events.organization_id
              and installation.installation_type = 'personal'
              and installation.created_by_user_id = (select auth.uid())
          )
        )
    )
  );
