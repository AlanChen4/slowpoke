-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.installations (
  id              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  organization_id bigint                   NOT NULL,
  collector_id    text                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at      timestamp with time zone
);

ALTER TABLE public.installations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.installations
  ADD CONSTRAINT installations_collector_id_key UNIQUE (collector_id);

ALTER TABLE public.installations
  ADD CONSTRAINT installations_id_organization_id_key UNIQUE (id, organization_id);

ALTER TABLE public.installations
  ADD CONSTRAINT installations_pkey PRIMARY KEY (id);

REVOKE ALL ON TABLE public.installations FROM anon, authenticated, service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.installations TO service_role;

CREATE INDEX installations_organization_id_idx ON public.installations (organization_id);

CREATE TABLE public.organization_members (
  organization_id bigint                   NOT NULL,
  user_id         uuid                     NOT NULL,
  role            text                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.organization_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_pkey PRIMARY KEY (organization_id, user_id);

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check CHECK (role = ANY (ARRAY['admin'::text, 'member'::text]));

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.organization_members FROM anon, authenticated, service_role;

GRANT SELECT ON public.organization_members TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.organization_members TO service_role;

CREATE INDEX organization_members_admin_lookup_idx ON public.organization_members (user_id, organization_id)
  WHERE ROLE = 'admin'::text;

CREATE INDEX organization_members_user_organization_idx ON public.organization_members (user_id, organization_id);

CREATE POLICY "members can read their memberships" ON public.organization_members
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.organizations (
  id         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  name       text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.organizations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE public.installations
  ADD CONSTRAINT installations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.organizations FROM anon, authenticated, service_role;

GRANT SELECT ON public.organizations TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.organizations TO service_role;

CREATE POLICY "members can read their organizations" ON public.organizations
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE ((membership.organization_id = organizations.id) AND (membership.user_id = ( SELECT auth.uid() AS uid))))));

CREATE TABLE public.prompt_events (
  id                  bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  organization_id     bigint                   NOT NULL,
  installation_id     bigint                   NOT NULL,
  batch_id            bigint                   NOT NULL,
  record_index        integer                  NOT NULL,
  provider            text                     NOT NULL,
  event_name          text                     NOT NULL,
  occurred_at         timestamp with time zone NOT NULL,
  prompt_id           text,
  session_id          text,
  actor_account_id    text,
  actor_email         text,
  prompt_text         text                     NOT NULL,
  is_redacted         boolean                  DEFAULT false NOT NULL,
  attributes          jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  resource_attributes jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.prompt_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_batch_id_record_index_key UNIQUE (batch_id, record_index);

ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_installation_id_organization_id_fkey FOREIGN KEY (installation_id, organization_id) REFERENCES public.installations(id, organization_id)
    ON DELETE CASCADE;

ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_pkey PRIMARY KEY (id);

ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_provider_check CHECK (provider = ANY (ARRAY['anthropic'::text, 'openai'::text]));

ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_record_index_check CHECK (record_index >= 0);

REVOKE ALL ON TABLE public.prompt_events FROM anon, authenticated, service_role;

GRANT SELECT ON public.prompt_events TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.prompt_events TO service_role;

CREATE INDEX prompt_events_installation_id_idx ON public.prompt_events (installation_id);

CREATE INDEX prompt_events_organization_occurred_idx ON public.prompt_events (organization_id, occurred_at DESC, id DESC);

CREATE INDEX prompt_events_batch_id_idx ON public.prompt_events (batch_id);

CREATE POLICY "admins can read organization prompts" ON public.prompt_events
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.organization_members membership
  WHERE ((membership.organization_id = prompt_events.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'admin'::text)))));

CREATE TABLE public.telemetry_batches (
  id              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  organization_id bigint                   NOT NULL,
  installation_id bigint                   NOT NULL,
  signal          text                     NOT NULL,
  content_sha256  text                     NOT NULL,
  raw_payload     jsonb                    NOT NULL,
  received_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.telemetry_batches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.telemetry_batches
  ADD CONSTRAINT telemetry_batches_content_sha256_check CHECK (char_length(content_sha256) = 64);

ALTER TABLE public.telemetry_batches
  ADD CONSTRAINT telemetry_batches_id_organization_id_key UNIQUE (id, organization_id);

ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_batch_id_organization_id_fkey FOREIGN KEY (batch_id, organization_id) REFERENCES public.telemetry_batches(id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.telemetry_batches
  ADD CONSTRAINT telemetry_batches_installation_id_organization_id_fkey FOREIGN KEY (installation_id, organization_id) REFERENCES public.installations(id, organization_id)
    ON DELETE CASCADE;

ALTER TABLE public.telemetry_batches
  ADD CONSTRAINT telemetry_batches_installation_id_signal_content_sha256_key UNIQUE (installation_id, signal, content_sha256);

ALTER TABLE public.telemetry_batches
  ADD CONSTRAINT telemetry_batches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.telemetry_batches
  ADD CONSTRAINT telemetry_batches_pkey PRIMARY KEY (id);

ALTER TABLE public.telemetry_batches
  ADD CONSTRAINT telemetry_batches_signal_check CHECK (signal = ANY (ARRAY['logs'::text, 'metrics'::text, 'traces'::text]));

REVOKE ALL ON TABLE public.telemetry_batches FROM anon, authenticated, service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.telemetry_batches TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE INDEX telemetry_batches_organization_received_idx ON public.telemetry_batches (organization_id, received_at DESC, id DESC);

CREATE INDEX telemetry_batches_installation_id_idx ON public.telemetry_batches (installation_id);
