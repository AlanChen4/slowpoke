-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.installations
  ADD COLUMN setup_package_version text;

ALTER TABLE public.installations
  ADD CONSTRAINT installations_setup_package_version_check CHECK (char_length(setup_package_version) >= 1 AND char_length(setup_package_version) <= 64);
