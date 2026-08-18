#!/usr/bin/env bash

set -euo pipefail

print_help() {
  cat <<'EOF'
Sync an app's allowlisted Doppler secrets to Modal.

Usage:
  bash scripts/sync-modal-secrets.sh --service <backend|collector>

Options:
  --service <name>  Service whose secrets should be synced.
  --help, -h        Show this help.

Examples:
  bash scripts/sync-modal-secrets.sh --service backend
  bash scripts/sync-modal-secrets.sh --service collector
EOF
}

service=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      if [[ $# -lt 2 || "$2" == -* ]]; then
        echo "Error: --service requires backend or collector." >&2
        echo "  Example: bash scripts/sync-modal-secrets.sh --service backend" >&2
        exit 2
      fi
      service="$2"
      shift 2
      ;;
    --help | -h)
      print_help
      exit 0
      ;;
    *)
      echo "Error: Unexpected argument: $1" >&2
      echo "  Example: bash scripts/sync-modal-secrets.sh --service backend" >&2
      exit 2
      ;;
  esac
done

if [[ "$service" != "backend" && "$service" != "collector" ]]; then
  echo "Error: --service must be backend or collector." >&2
  echo "  Example: bash scripts/sync-modal-secrets.sh --service backend" >&2
  exit 2
fi

: "${DOPPLER_PROJECT:?DOPPLER_PROJECT is required}"
: "${DOPPLER_CONFIG:?DOPPLER_CONFIG is required}"
: "${MODAL_ENVIRONMENT:?MODAL_ENVIRONMENT is required}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$service" == "backend" ]]; then
  doppler run \
    --project "$DOPPLER_PROJECT" \
    --config "$DOPPLER_CONFIG" \
    --only-secrets SLOWPOKE_INGEST_TOKEN,SUPABASE_URL,SUPABASE_SECRET_KEY,SLOWPOKE_INSTALLATION_ISSUER,SLOWPOKE_COLLECTOR_AUDIENCE,SLOWPOKE_COLLECTOR_URL,SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY,SLOWPOKE_INSTALLATION_SIGNING_KID \
    -- sh -c '
      exec "$1" secret create \
        --env "$2" \
        --force \
        slowpoke-backend \
        SLOWPOKE_INGEST_TOKEN="$SLOWPOKE_INGEST_TOKEN" \
        SUPABASE_URL="$SUPABASE_URL" \
        SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" \
        SLOWPOKE_INSTALLATION_ISSUER="$SLOWPOKE_INSTALLATION_ISSUER" \
        SLOWPOKE_COLLECTOR_AUDIENCE="$SLOWPOKE_COLLECTOR_AUDIENCE" \
        SLOWPOKE_COLLECTOR_URL="$SLOWPOKE_COLLECTOR_URL" \
        SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY="$SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY" \
        SLOWPOKE_INSTALLATION_SIGNING_KID="$SLOWPOKE_INSTALLATION_SIGNING_KID"
    ' _ "$repo_root/apps/backend/.venv/bin/modal" "$MODAL_ENVIRONMENT"
else
  doppler run \
    --project "$DOPPLER_PROJECT" \
    --config "$DOPPLER_CONFIG" \
    --only-secrets SLOWPOKE_INSTALLATION_ISSUER,SLOWPOKE_COLLECTOR_AUDIENCE,SLOWPOKE_INGEST_URL,SLOWPOKE_INGEST_TOKEN \
    -- sh -c '
      exec "$1" secret create \
        --env "$2" \
        --force \
        slowpoke-collector \
        SLOWPOKE_INSTALLATION_ISSUER="$SLOWPOKE_INSTALLATION_ISSUER" \
        SLOWPOKE_COLLECTOR_AUDIENCE="$SLOWPOKE_COLLECTOR_AUDIENCE" \
        SLOWPOKE_INGEST_URL="$SLOWPOKE_INGEST_URL" \
        SLOWPOKE_INGEST_TOKEN="$SLOWPOKE_INGEST_TOKEN"
    ' _ "$repo_root/apps/collector/.venv/bin/modal" "$MODAL_ENVIRONMENT"
fi
