# Slowpoke backend

The backend accepts tenant-stamped OTLP/JSON from the collector and stores raw
batches plus extracted user prompts in Supabase.

```sh
pnpm backend:dev
```

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
