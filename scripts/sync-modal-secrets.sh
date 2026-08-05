#!/usr/bin/env bash

set -euo pipefail

: "${DOPPLER_PROJECT:?DOPPLER_PROJECT is required}"
: "${DOPPLER_CONFIG:?DOPPLER_CONFIG is required}"
: "${MODAL_ENVIRONMENT:?MODAL_ENVIRONMENT is required}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

doppler run \
  --project "$DOPPLER_PROJECT" \
  --config "$DOPPLER_CONFIG" \
  --only-secrets SLOWPOKE_INGEST_TOKEN,SUPABASE_URL,SUPABASE_SECRET_KEY \
  -- sh -c '
    exec "$1" secret create \
      --env "$2" \
      --force \
      slowpoke-backend \
      SLOWPOKE_INGEST_TOKEN="$SLOWPOKE_INGEST_TOKEN" \
      SUPABASE_URL="$SUPABASE_URL" \
      SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY"
  ' _ "$repo_root/apps/backend/.venv/bin/modal" "$MODAL_ENVIRONMENT"

doppler run \
  --project "$DOPPLER_PROJECT" \
  --config "$DOPPLER_CONFIG" \
  --only-secrets SLOWPOKE_OTLP_HTPASSWD,SLOWPOKE_INGEST_URL,SLOWPOKE_INGEST_TOKEN \
  -- sh -c '
    exec "$1" secret create \
      --env "$2" \
      --force \
      slowpoke-collector \
      SLOWPOKE_OTLP_HTPASSWD="$SLOWPOKE_OTLP_HTPASSWD" \
      SLOWPOKE_INGEST_URL="$SLOWPOKE_INGEST_URL" \
      SLOWPOKE_INGEST_TOKEN="$SLOWPOKE_INGEST_TOKEN"
  ' _ "$repo_root/apps/collector/.venv/bin/modal" "$MODAL_ENVIRONMENT"
