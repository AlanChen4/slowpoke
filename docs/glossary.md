# Glossary

**Organization:** A company workspace that owns memberships, invitations,
installations, and telemetry.

**Invitation:** A seven-day offer to join an organization as a member or an
administrator. The signed-in email address must match the invitation email.

**Membership:** A user's access to one organization. A user can have memberships
in several organizations.

**Administrator:** A member with the `admin` role. Administrators can manage
organization settings, invitations, and installations. They can read all prompt
events in the organization.

**Installation:** One AI tool connected from one computer. An installation owns
a signed token and reports its verification, last-seen, and revocation state.

**AI Tool:** Codex or Claude Code. A computer that uses both tools has two
installations.

**Completed Organization:** An organization where the current user owns at
least one active, verified installation. Revoking the user's last qualifying
installation makes the organization incomplete.

**Collector:** An OpenTelemetry gateway that validates installation tokens,
stamps installation and tool identity, batches signals, and sends them to the
backend.

**Ingestion Backend:** A FastAPI service that issues installation tokens and
validates, partitions, deduplicates, and stores Collector exports.

**OTLP Export:** One request containing OpenTelemetry logs, metrics, or traces.

**Resource Group:** A top-level OTLP group that shares resource attributes. The
backend partitions exports at this level.

**Telemetry Batch:** A canonical, organization-scoped OTLP partition stored with
its signal and content digest.

**Prompt Event:** A normalized Codex or Claude Code user-prompt log derived from
a telemetry batch.
