#!/usr/bin/env bash
set -euo pipefail

generated_file="$(mktemp)"
trap 'rm -f "$generated_file"' EXIT

bash scripts/generate-python-db-types.sh > "$generated_file"

if ! cmp -s "$generated_file" apps/backend/slowpoke_backend/database_types.py; then
  echo "Python database types have drifted. Run: pnpm db:types" >&2
  exit 1
fi
