#!/usr/bin/env bash

set -euo pipefail

status_output="$(pnpm exec supabase status -o env)"

read_status_value() {
  local name="$1"

  printf '%s\n' "$status_output" |
    sed -n "s/^${name}=\"\([^\"]*\)\"$/\1/p"
}

supabase_api_url="$(read_status_value API_URL)"
supabase_secret_key="$(read_status_value SECRET_KEY)"
supabase_anon_key="$(read_status_value ANON_KEY)"
supabase_jwt_secret="$(read_status_value JWT_SECRET)"

if [[ -z "$supabase_api_url" || -z "$supabase_secret_key" || -z "$supabase_anon_key" || -z "$supabase_jwt_secret" ]]; then
  printf 'Unable to read local Supabase database-test credentials.\n' >&2
  exit 1
fi

(
  export SUPABASE_URL="$supabase_api_url"
  export SUPABASE_SECRET_KEY="$supabase_secret_key"

  cd apps/backend
  .venv/bin/pytest -m database
)

(
  export LOCAL_SUPABASE_API_URL="$supabase_api_url"
  export LOCAL_SUPABASE_ANON_KEY="$supabase_anon_key"
  export LOCAL_SUPABASE_JWT_SECRET="$supabase_jwt_secret"
  export RUN_ANALYTICS_CONTRACT_TEST=1

  pnpm --filter @slowpoke/web exec vitest run \
    src/lib/analytics/prompt-analytics.contract.test.ts
)
