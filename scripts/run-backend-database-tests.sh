#!/usr/bin/env bash
set -euo pipefail

status_output="$(pnpm exec supabase status -o env)"
API_URL="$(printf '%s\n' "$status_output" | sed -n 's/^API_URL="\([^"]*\)"$/\1/p')"
SECRET_KEY="$(printf '%s\n' "$status_output" | sed -n 's/^SECRET_KEY="\([^"]*\)"$/\1/p')"

if [[ -z "$API_URL" || -z "$SECRET_KEY" ]]; then
  echo "Unable to read local Supabase credentials" >&2
  exit 1
fi

export SUPABASE_URL="$API_URL"
export SUPABASE_SECRET_KEY="$SECRET_KEY"

cd apps/backend
.venv/bin/pytest -m database
