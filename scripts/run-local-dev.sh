#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
collector_name="slowpoke-collector-local-$$"
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

stop_stale_collectors() {
  local container_names
  local name
  local owner_pid

  container_names="$(
    docker ps \
      --filter 'name=slowpoke-collector-local-' \
      --format '{{.Names}}'
  )"

  while IFS= read -r name; do
    if [[ ! "$name" =~ ^slowpoke-collector-local-([0-9]+)$ ]]; then
      continue
    fi

    owner_pid="${BASH_REMATCH[1]}"
    if kill -0 "$owner_pid" 2>/dev/null; then
      continue
    fi

    printf 'Stopping stale local Collector: %s\n' "$name"
    docker stop --time 10 "$name" >/dev/null
  done <<<"$container_names"
}

restart_local_postgrest() {
  local container_id

  container_id="$(
    docker ps \
      --filter "label=com.supabase.cli.workdir=$project_root" \
      --format '{{.ID}} {{.Image}}' |
      awk '$2 ~ /postgrest/ { print $1; exit }'
  )"

  if [[ -z "$container_id" ]]; then
    printf 'Unable to find the local Supabase REST service.\n' >&2
    exit 1
  fi

  # PostgREST caches time for JWT validation. Restart it so a machine sleep or
  # clock change cannot leave fresh local Auth tokens looking future-dated.
  docker restart "$container_id" >/dev/null
}

for command in docker pnpm uv; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

read_credential_value() {
  local name="$1"

  printf '%s\n' "$codex_credentials" |
    sed -n "s/^${name}='\([^']*\)'$/\1/p"
}

if ! codex_credentials="$(node "$project_root/scripts/setup-local-codex.mjs" credentials)"; then
  exit 1
fi

SLOWPOKE_INGEST_TOKEN="$(read_credential_value SLOWPOKE_INGEST_TOKEN)"
SLOWPOKE_OTLP_HTPASSWD="$(read_credential_value SLOWPOKE_OTLP_HTPASSWD)"
if [[ -z "$SLOWPOKE_INGEST_TOKEN" || -z "$SLOWPOKE_OTLP_HTPASSWD" ]]; then
  printf 'Invalid Slowpoke credentials in the Codex config. Run: pnpm setup:codex\n' >&2
  exit 1
fi
export SLOWPOKE_INGEST_TOKEN SLOWPOKE_OTLP_HTPASSWD

cd "$project_root"

stop_stale_collectors

bash scripts/run-local-supabase.sh start >/dev/null
restart_local_postgrest
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
  exec pnpm --filter @slowpoke/web dev
) &
pids+=("$!")

(
  export SUPABASE_URL="$supabase_url"
  export SUPABASE_SECRET_KEY="$supabase_secret_key"
  cd apps/backend
  exec uv run uvicorn slowpoke_backend:create_app \
      --factory \
      --reload \
      --port "$backend_port"
) &
pids+=("$!")

(
  exec docker run --rm \
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
printf '  Web:       http://127.0.0.1:3123\n'
printf '  Backend:   http://127.0.0.1:%s\n' "$backend_port"
printf '  Collector: http://127.0.0.1:%s\n' "$collector_port"
printf '  Studio:    http://127.0.0.1:55323\n\n'

wait_for_service_exit
