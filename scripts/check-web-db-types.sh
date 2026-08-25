#!/usr/bin/env bash

set -euo pipefail

generated_file="$(mktemp)"
trap 'rm -f "$generated_file"' EXIT

bash scripts/generate-web-db-types.sh > "$generated_file"

if ! cmp -s "$generated_file" apps/web/src/lib/supabase/database.types.ts; then
  echo "Web database types have drifted. Run: pnpm db:types" >&2
  exit 1
fi
