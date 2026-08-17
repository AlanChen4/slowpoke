# Test layout

Tests live with the code that owns them:

- `apps/backend/tests`: backend unit, database, and local ingestion tests
- `apps/collector/tests`: Collector tests
- `apps/web/src/**/*.test.ts`: web tests colocated with their modules
- `supabase/tests`: pgTAP database policy and behavior tests
- `tests/tooling`: repository-level development-tool tests

Run the default suite with `pnpm test`. Run `pnpm test --help` to discover
focused suites, copy-pasteable examples, and the non-mutating `--dry-run` mode.
