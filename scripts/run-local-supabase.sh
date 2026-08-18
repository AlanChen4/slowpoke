#!/usr/bin/env bash

set -euo pipefail

# Supabase requires values for enabled OAuth providers even when local development
# uses the seeded email account. Real values can still be supplied explicitly.
: "${SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID:=local-oauth-disabled}"
: "${SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET:=local-oauth-disabled}"
: "${SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID:=local-oauth-disabled}"
: "${SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET:=local-oauth-disabled}"

export SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID
export SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET

if [[ "${1:-}" == start ]]; then
  pnpm exec supabase "$@" >/dev/null
  printf '%s\n' 'status: started' 'target: local Supabase stack'
  exit 0
fi

exec pnpm exec supabase "$@"
