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

## Deploy

From this directory:

```sh
python -m pip install -r requirements.txt
modal deploy modal_app.py
```

The Collector scales to zero and keeps an active container around for ten minutes after its last request. Native harness exporters should use a request timeout long enough to tolerate a cold start.

The sending queue is intentionally in-memory for the MVP. Pending telemetry can be lost when a container is replaced; add a persistent queue before treating delivery as compliance-grade.
