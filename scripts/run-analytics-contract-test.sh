#!/usr/bin/env bash

set -euo pipefail

status_output="$(pnpm exec supabase status -o env)"

read_status_value() {
  local name="$1"

  printf '%s\n' "$status_output" |
    sed -n "s/^${name}=\"\([^\"]*\)\"$/\1/p"
}

LOCAL_SUPABASE_API_URL="$(read_status_value API_URL)"
LOCAL_SUPABASE_ANON_KEY="$(read_status_value ANON_KEY)"
LOCAL_SUPABASE_JWT_SECRET="$(read_status_value JWT_SECRET)"

if [[ -z "$LOCAL_SUPABASE_API_URL" || -z "$LOCAL_SUPABASE_ANON_KEY" || -z "$LOCAL_SUPABASE_JWT_SECRET" ]]; then
  printf 'Unable to read local Supabase contract-test credentials.\n' >&2
  exit 1
fi

export LOCAL_SUPABASE_API_URL
export LOCAL_SUPABASE_ANON_KEY
export LOCAL_SUPABASE_JWT_SECRET
export RUN_ANALYTICS_CONTRACT_TEST=1

pnpm --filter @slowpoke/web exec vitest run \
  src/lib/analytics/prompt-analytics.contract.test.ts
