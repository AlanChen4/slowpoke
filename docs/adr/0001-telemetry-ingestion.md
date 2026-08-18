# ADR 0001: Store tenant-scoped raw telemetry and derived prompts

## Status

Accepted for the ingestion MVP.

## Context

The Collector authenticates installations and stamps OTLP resource groups with
`slowpoke.installation.id` and `slowpoke.installation.tool`. It sends OTLP/JSON
to the backend. Batching can combine installations in one export. Slowpoke must
retain source telemetry for reprocessing and expose prompts through row-level
security (RLS).

## Decision

### Partition exports

The backend partitions exports by installation ID and tool. It stores valid
partitions, then returns `503` if any installation is unknown. It discards
telemetry from revoked installations. The Collector retries the full export;
existing rows deduplicate.

### Authenticate installation identity

Application-owned IDs use UUIDs from `gen_random_uuid()`. The installation UUID
is the signed token subject and the value of `slowpoke.installation.id`. ADR
0002 defines token enrollment, per-tool identity, and revocation.

### Store raw and derived data

Every partition becomes canonical OTLP JSON in `telemetry_batches`. Only
`codex.user_prompt` and `claude_code.user_prompt` logs produce `prompt_events`;
metrics and traces stay raw. A SHA-256 digest deduplicates batches by installation
and signal. Batch ID plus log position deduplicates prompts. Raw batches retain
complete attributes for reprocessing.

### Limit data access

All public tables use RLS and explicit grants. Organization administrators may
read all prompts and installations in their organization. Members may read
prompts and installations that they own. Raw batches have no frontend grants.
Only server code receives the Supabase secret key.

### Share ingestion logic

Uvicorn and the Modal ASGI wrapper use the same FastAPI app factory. Modal keeps
zero warm containers.

## Consequences

- Raw telemetry can be reprocessed when extraction rules change.
- UUIDv4 inserts have less index locality than sequential identifiers. A future
  migration can change new-row defaults to UUIDv7 when the database provides it
  and exposing creation time is acceptable.
- Mixed-tenant exports cannot create cross-organization rows.
- Unknown installations do not block valid tenant partitions.
- Collector retries are safe after ambiguous failures.
- Raw storage grows without bound until a retention policy is added.

Deployment and retention remain outside this decision.
