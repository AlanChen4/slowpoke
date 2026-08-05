# Slowpoke backend

The backend accepts tenant-stamped OTLP/JSON from the collector and stores raw
batches plus extracted user prompts in Supabase.

```sh
pnpm dev
```

Run that command from the repository root to start local Supabase, the frontend,
backend, and Collector. From the host, the backend URL is
`http://127.0.0.1:8000`. The Collector container reaches it at
`http://host.docker.internal:8000`.

Required environment variables:

- `SLOWPOKE_INGEST_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Deploy the ASGI wrapper only after adding those values to a Modal secret named
`slowpoke-backend`:

```sh
cd apps/backend
uv run modal deploy modal_app.py
```

Production deployments use Doppler as the source of truth. GitHub Actions
refreshes the filtered Modal secret before each deployment through
`scripts/sync-modal-secrets.sh`.
