# ADR 0002: Enroll per-tool installations with signed tokens

## Status

Accepted.

## Context

One person can use Codex and Claude Code on the same computer. Slowpoke needs a
separate identity for each tool and computer. Client credentials must support
local configuration without exposing the Supabase secret key.

## Decision

### Create short-lived enrollments

Authenticated server actions create an enrollment for one organization and one
or more selected tools. The database stores a SHA-256 digest of the setup code.
It never stores the raw code or an installation token. The code expires after
15 minutes.

The setup package exchanges the code with the backend. An exchange creates one
installation row for each selected tool. A retry with the same active code
returns tokens for the same rows.

### Issue signed installation tokens

The backend signs RS256 tokens. Each token contains these claims:

- `sub`: installation ID
- `aud`: Collector audience
- `iss`: backend installation-token issuer
- `organization_id`: organization ID
- `tool`: `codex` or `claude_code`

The backend publishes OpenID Connect discovery metadata and a public JSON Web
Key Set (JWKS). The signing key stays in the backend secret store. The token has
a long technical expiry. Database revocation controls its product lifetime.

### Validate and stamp claims in the Collector

The Collector OIDC authenticator verifies the signature, issuer, audience, and
expiry. It writes the token subject to `slowpoke.installation.id` and the tool
claim to `slowpoke.installation.tool` on every OTLP resource group.

The backend rejects a tool claim that does not match the installation row. It
also rejects prompt events whose source does not match the installation tool.
It updates `verified_at` and `last_seen_at` after validation. It discards events
from revoked installations.

### Configure tools with one setup package

`@slowpokeai/setup` writes each token only to its tool's user configuration. It
preserves unrelated Codex TOML and Claude Code JSON settings. Writes are atomic,
files use private permissions, and each existing file gets one backup.

The package sends one small verification log for each installation. The log is
not a prompt event. Onboarding derives completion from an active, verified
installation owned by the user.

## Consequences

- One computer can have separate Codex and Claude Code installations.
- Retried enrollment exchanges do not create duplicate installations.
- Revocation takes effect when the backend resolves the next telemetry batch.
- A signing-key replacement invalidates tokens signed by the old key. Operators
  must plan re-enrollment unless a future issuer supports overlapping keys.
- The setup command contains a short-lived secret and must not appear in logs.
