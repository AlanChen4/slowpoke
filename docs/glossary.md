# Glossary

**Organization:** A company tenant that owns users, installations, and telemetry.

**Administrator:** An organization member with the `admin` role. May read the
organization's prompts through row-level security (RLS).

**Installation:** A Collector credential for one organization. Its UUID is both
the username for HTTP Basic authentication and `slowpoke.installation.id`.

**Collector:** An OpenTelemetry gateway that authenticates, stamps installation
identity, batches signals, and sends them to the backend.

**Ingestion backend:** A FastAPI service that validates, partitions, deduplicates,
and stores Collector exports.

**OTLP export:** One JSON request containing OpenTelemetry logs, metrics, or
traces.

**Resource group:** A top-level OTLP group that shares resource attributes. The
backend partitions exports at this level.

**Telemetry batch:** A canonical tenant-scoped OTLP partition stored with its
signal and content digest.

**Prompt event:** A normalized Codex or Claude user-prompt log derived from a
telemetry batch.
