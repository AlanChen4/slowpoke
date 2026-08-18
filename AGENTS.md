# Repository instructions

## Product

Slowpoke records how employees use AI tools. Current ingestion path:

1. `apps/collector` receives and authenticates OTLP/HTTP.
2. `apps/backend` validates telemetry and stores it in Supabase.
3. `apps/web` reads tenant-scoped prompt data through row-level security.

Before changing backend or Collector, read the nearest `AGENTS.md` in that app.

## Develop locally

Install Docker Desktop, pnpm, and uv. Configure the workspace once:

```sh
pnpm install
(cd apps/backend && uv sync --locked)
(cd apps/collector && uv sync --locked)
pnpm setup:codex
pnpm db:reset --yes
```

Run `pnpm dev` to start web, backend, Collector, and local Supabase. Services use:

- Web: `http://127.0.0.1:3123`
- Backend: `http://127.0.0.1:8000`
- Collector: `http://127.0.0.1:4318`
- Supabase Studio: `http://127.0.0.1:55323`

Supabase CLI provides local credentials. `pnpm setup:codex` stores machine-local
ingestion credentials in the user's Codex telemetry exporter configuration so
every worktree can reuse them.
Stopping `pnpm dev` leaves Supabase running. Run `pnpm db:reset --yes` to
rebuild it from migrations and seed data without an interactive confirmation.

## Verify

- `pnpm test`: Run the default test suite.
- `pnpm test --help`: List focused suites, examples, and dry-run support.
- `pnpm test:e2e`: Run real Codex and Claude prompts through the local stack.
- `pnpm typecheck:web` / `pnpm typecheck:backend`: Run one app's type checks.
- `pnpm lint:js` / `pnpm lint:backend` / `pnpm lint:collector`: Run focused lint checks.
- `pnpm knip`: Find unused JavaScript and TypeScript files, dependencies, and exports.
- `pnpm vulture[:backend|:collector]`: Find unused Python symbols.
- `pnpm deptry[:backend|:collector]`: Find Python dependency issues.
- Before a PR update, run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm format:check`, plus `pnpm knip`, `pnpm vulture`, and `pnpm deptry`.

## UI headings

- Native `h1`–`h6` elements require an immediately preceding JSX comment in
  the form `{/* HEADING-REASON: <human-authored reason> */}`.
- Agents must not invent, add, or edit a `HEADING-REASON` comment unless the
  user explicitly supplies or approves the rationale.
- Do not place a `p` element immediately above or below a native heading.

## Supabase

- Read `.agents/skills/supabase/SKILL.md` for every Supabase task.
- Also read `.agents/skills/supabase-postgres-best-practices/SKILL.md` before
  changing schemas, migrations, policies, or SQL.
- Never expose `SUPABASE_SECRET_KEY` to frontend code.

## Reference docs

Read detailed docs only when task needs them:

- [Telemetry ingestion design](docs/adr/0001-telemetry-ingestion.md)
- [Production deployment and secrets](docs/deployment.md)
- [Domain glossary](docs/glossary.md)

## Pull requests

Before committing, pushing, or changing a PR:

- Read `.agents/skills/caveman-pr/SKILL.md` and use it for the whole PR.
- Never use `--no-verify`.
- Obey `scripts/check-metadata.mjs`.
- Use Conventional Commits for commit and PR titles.
- Include `Summary`, `Why`, and `Validation` in PR body.
