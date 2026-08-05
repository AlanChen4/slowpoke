# Slowpoke

Slowpoke gives companies visibility and control over how employees use AI tools, starting with a unified record of every prompt.

## Local development

Install Docker Desktop, pnpm, uv, and the Doppler CLI. Configure Doppler once:

```sh
doppler login
pnpm install
(cd apps/backend && uv sync --locked)
(cd apps/collector && uv sync --locked)
pnpm db:reset
```

Start local Supabase, the frontend, backend, and Collector together:

```sh
pnpm dev
```

The command reads local Supabase credentials directly from the Supabase CLI.
Doppler provides the local OAuth configuration, shared ingestion token, and
Collector htpasswd file from the `frontend/dev` and `backend/dev` configs.
Stopping the command stops the application processes and Collector; Supabase
keeps running so its development data remains available.

Run the complete local test suite with `pnpm test` and the real Codex/Claude
ingestion test with `pnpm test:e2e`.
