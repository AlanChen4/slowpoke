# Slowpoke Collector

This deployable runs the OpenTelemetry Collector Contrib distribution as Slowpoke's public OTLP/HTTP gateway.

## Responsibilities

- Receive OTLP/HTTP logs, metrics, and traces on port `4318`.
- Authenticate installations with HTTP Basic authentication.
- Add the authenticated username as `slowpoke.installation.id`.
- Apply memory limits, batching, retry, and an in-memory sending queue.
- Forward OTLP/JSON to the private Slowpoke ingestion endpoint.

Vendor-specific normalization and database writes belong in the web application's server layer, not in this configuration.

## Modal secret

Create a Modal secret named `slowpoke-collector` with:

- `SLOWPOKE_OTLP_HTPASSWD`: one or more newline-separated htpasswd entries. Use the username as the opaque installation ID.
- `SLOWPOKE_INGEST_URL`: the internal ingestion base URL, ending in `/api/internal/telemetry`.
- `SLOWPOKE_INGEST_TOKEN`: the bearer token shared only by the Collector and ingestion service.

Do not place raw passwords or ingestion credentials in this repository.

Production deployments use Doppler as the source of truth. GitHub Actions
refreshes this filtered Modal secret before each deployment through
`scripts/sync-modal-secrets.sh`.

## Deploy

From this directory:

```sh
uv sync --locked
uv run modal deploy modal_app.py
```

The Collector scales to zero and keeps an active container around for ten minutes after its last request. Native harness exporters should use a request timeout long enough to tolerate a cold start.

The sending queue is intentionally in-memory for the MVP. Pending telemetry can be lost when a container is replaced; add a persistent queue before treating delivery as compliance-grade.

## Develop

Start the same Modal Server definition as an ephemeral development app:

```sh
uv sync --locked
uv run modal serve modal_app.py
```

`modal serve` creates a temporary public URL and stops the app when the command
exits. It does not create or update a deployment.

## Test

Run the offline tests:

```sh
uv run pytest
```

Verify all three OTLP pipelines through an ephemeral Modal collector and sink
using synthetic records:

```sh
SLOWPOKE_RUN_MODAL_E2E=1 uv run pytest -m modal_e2e
```

Real Codex and Claude behavior is covered once by the local backend E2E. Modal
tests cover only collector packaging, authentication, stamping, and routing.
The sink is in-memory, is exposed only for the test's lifetime, and rejects
collector requests without its ephemeral bearer token.

The test-only Modal app passes temporary values from the local process into
`modal serve`. It registers the shared collector definition with an ephemeral
secret; the production app can only register that definition with the named
`slowpoke-collector` Modal secret.

Configuration follows the current
[Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage),
[Codex monitoring](https://developers.openai.com/codex/security#monitoring-and-telemetry),
and [Modal development server](https://modal.com/docs/guide/webhooks#developing-with-modal-serve)
documentation.
