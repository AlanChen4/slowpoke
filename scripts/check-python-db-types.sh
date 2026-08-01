#!/usr/bin/env bash
set -euo pipefail

generated_file="$(mktemp)"
trap 'rm -f "$generated_file"' EXIT

pnpm exec supabase gen types --lang=python --local --schema public > "$generated_file"

if ! cmp -s "$generated_file" apps/backend/slowpoke_backend/database_types.py; then
  echo "Python database types have drifted. Run: pnpm db:types" >&2
  exit 1
fi
