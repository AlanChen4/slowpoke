# Slowpoke

Slowpoke gives companies visibility and control over how employees use AI tools, starting with a unified record of every prompt.

## Repository structure

Slowpoke is a monorepo with independently deployable services:

- `apps/web`: the Next.js control plane, dashboard, and initial private ingestion API.
- `apps/collector`: the OpenTelemetry Collector gateway deployed on Modal.
- `packages/telemetry`: shared canonical telemetry contracts.
- `supabase`: local Supabase configuration and, as the data model grows, database migrations.

The Collector owns transport concerns such as OTLP reception, authentication, batching, and retries. The web server owns tenant authorization, vendor normalization, deduplication, and persistence.

## Development

Install dependencies and start the web application from the repository root:

```sh
pnpm install
pnpm dev
```

Run all repository checks with:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

When deploying the web application to Vercel, configure the project root directory as `apps/web`. Keep installs at the workspace level so the web app can resolve `packages/telemetry` through the committed pnpm lockfile.
