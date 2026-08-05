# Glossary

**Organization** — A company tenant that owns users, installations, telemetry,
and prompt events.

**Administrator** — An authenticated organization member with the `admin` role.
Administrators may read their organization's prompt events through RLS.

**Installation:** A Collector credential identity mapped to exactly one
organization. Its UUID is the Basic-auth username and becomes
`slowpoke.installation.id`.

**Collector** — The OpenTelemetry gateway that authenticates local harnesses,
stamps installation identity, batches signals, and forwards them to the
ingestion backend.

**Ingestion backend** — The authenticated FastAPI service that validates,
partitions, deduplicates, and persists collector exports.

**OTLP export** — One OpenTelemetry logs, metrics, or traces request encoded as
JSON between the collector and backend.

**Resource group** — A top-level OTLP group sharing resource attributes. It is
the unit partitioned by installation.

**Telemetry batch** — One canonical, tenant-scoped OTLP partition stored with
its signal and content digest.

**Prompt event** — A normalized Codex or Claude user-prompt log derived from a
telemetry batch.
