# Collector instructions

## Service

Slowpoke Collector is a public OTLP/HTTP gateway built with OpenTelemetry
Collector Contrib. It must:

- Receive logs, metrics, and traces on port `4318`.
- Authenticate installations with HTTP Basic authentication.
- Stamp the authenticated username as `slowpoke.installation.id`.
- Apply memory limits, batching, retry, and an in-memory sending queue.
- Send OTLP/JSON to the authenticated backend endpoint.

The backend owns vendor normalization and database writes.

## Configuration

- `SLOWPOKE_OTLP_HTPASSWD`: Newline-separated htpasswd entries. Each username
  must match an installation UUID.
- `SLOWPOKE_INGEST_URL`: Backend URL ending in `/api/internal/telemetry`.
- `SLOWPOKE_INGEST_TOKEN`: Shared backend bearer token.

Keep raw passwords and ingestion credentials out of the repository.

## Delivery

Modal scales the Collector to zero after a 10-minute idle period. Exporter
timeouts must allow for cold starts.

The queue lives in memory. Container replacement can lose queued telemetry.
Durable delivery requires a persistent queue.

## Develop and verify

Use root-level `pnpm dev` for the local Docker stack.

Run an ephemeral Modal Collector from this directory:

```sh
uv sync --locked
uv run modal serve modal_app.py
```

Remote Collector cannot reach `127.0.0.1` or `host.docker.internal`.
`SLOWPOKE_INGEST_URL` must be internet-accessible for this workflow.

- `uv run pytest`: Run offline tests.
- `SLOWPOKE_RUN_MODAL_E2E=1 uv run pytest -m modal_e2e`: Test all OTLP pipelines
  through an ephemeral Modal Collector and sink.

The backend E2E covers real Codex and Claude behavior. Modal tests cover
packaging, authentication, stamping, and routing.

References:

- [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage)
- [Codex monitoring](https://developers.openai.com/codex/security#monitoring-and-telemetry)
- [Modal development server](https://modal.com/docs/guide/webhooks#developing-with-modal-serve)
