#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
collector_name="slowpoke-collector-local-$$"
web_port="${SLOWPOKE_WEB_PORT:-3000}"
backend_port="${SLOWPOKE_BACKEND_PORT:-8000}"
collector_port="${SLOWPOKE_COLLECTOR_PORT:-4318}"
pids=()

read_status_value() {
  local name="$1"

  printf '%s\n' "$supabase_status" |
    sed -n "s/^${name}=\"\([^\"]*\)\"$/\1/p"
}

stop_services() {
  local exit_code=$?

  trap - EXIT INT TERM

  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  docker stop --time 10 "$collector_name" >/dev/null 2>&1 || true

  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  exit "$exit_code"
}

wait_for_service_exit() {
  local pid

  while true; do
    for pid in "${pids[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        set +e
        wait "$pid"
        local exit_code=$?
        set -e
        return "$exit_code"
      fi
    done

    sleep 1
  done
}

for command in docker doppler pnpm uv; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

cd "$project_root"

bash scripts/run-local-supabase.sh start >/dev/null
supabase_status="$(pnpm exec supabase status -o env)"

supabase_url="$(read_status_value API_URL)"
supabase_secret_key="$(read_status_value SECRET_KEY)"
supabase_publishable_key="$(read_status_value PUBLISHABLE_KEY)"
if [[ -z "$supabase_publishable_key" ]]; then
  supabase_publishable_key="$(read_status_value ANON_KEY)"
fi

if [[ -z "$supabase_url" || -z "$supabase_secret_key" || -z "$supabase_publishable_key" ]]; then
  printf 'Unable to read local Supabase credentials.\n' >&2
  exit 1
fi

trap stop_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(
  export SUPABASE_SECRET_KEY="$supabase_secret_key"
  export NEXT_PUBLIC_SUPABASE_URL="$supabase_url"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$supabase_publishable_key"
  exec pnpm --filter @slowpoke/web dev --port "$web_port"
) &
pids+=("$!")

(
  export SUPABASE_URL="$supabase_url"
  export SUPABASE_SECRET_KEY="$supabase_secret_key"
  cd apps/backend
  exec doppler run \
    --project backend \
    --config dev \
    --only-secrets SLOWPOKE_INGEST_TOKEN \
    --forward-signals \
    -- uv run uvicorn slowpoke_backend:create_app \
      --factory \
      --reload \
      --port "$backend_port"
) &
pids+=("$!")

(
  exec doppler run \
    --project backend \
    --config dev \
    --only-secrets SLOWPOKE_OTLP_HTPASSWD,SLOWPOKE_INGEST_TOKEN \
    --forward-signals \
    -- docker run --rm \
      --name "$collector_name" \
      --publish "127.0.0.1:${collector_port}:4318" \
      --env SLOWPOKE_OTLP_HTPASSWD \
      --env SLOWPOKE_INGEST_TOKEN \
      --env "SLOWPOKE_INGEST_URL=http://host.docker.internal:${backend_port}/api/internal/telemetry" \
      --volume "$project_root/apps/collector/otelcol.yaml:/etc/otelcol-contrib/config.yaml:ro" \
      ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.157.0 \
      --config=/etc/otelcol-contrib/config.yaml
) &
pids+=("$!")

printf '\nSlowpoke local development\n'
printf '  Web:       http://127.0.0.1:%s\n' "$web_port"
printf '  Backend:   http://127.0.0.1:%s\n' "$backend_port"
printf '  Collector: http://127.0.0.1:%s\n' "$collector_port"
printf '  Studio:    http://127.0.0.1:55323\n\n'

wait_for_service_exit
