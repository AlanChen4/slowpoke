# Backend instructions

## Service

The Collector stamps OTLP/JSON with an installation ID and AI tool. The backend validates
each export, stores raw telemetry batches, and extracts user prompts into
Supabase.

Endpoints:

- Health: `GET /healthz`
- Ingestion: `POST /api/internal/telemetry/v1/{signal}`

## Configuration

Pydantic settings names must match Doppler variables:

- `SLOWPOKE_INGEST_TOKEN`: Required Collector bearer token.
- `SUPABASE_URL`: Required Supabase API URL.
- `SUPABASE_SECRET_KEY`: Required privileged database key.
- `SLOWPOKE_MAX_DECOMPRESSED_BYTES`: Optional request limit. Defaults to 16 MiB.

Keep secrets as `SecretStr`. Call `get_secret_value()` only where an API needs
the raw string. Never send `SUPABASE_SECRET_KEY` to a client.

## Develop and verify

Use root-level `pnpm dev` for the local stack. The Collector container reaches
the backend at `http://host.docker.internal:8000`.

Run `uv run pytest` from this directory. Database tests need local Supabase;
root-level `pnpm test` starts it.
