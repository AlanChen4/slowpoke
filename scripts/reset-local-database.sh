#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_directory/.." && pwd)"

print_help() {
  printf '%s\n' \
    'Rebuild the local Supabase database from migrations and seed data.' \
    '' \
    'Usage:' \
    '  pnpm db:reset [--yes] [--dry-run]' \
    '' \
    'Options:' \
    '  --yes       Skip the confirmation prompt.' \
    '  --dry-run   Print the reset plan without changing the database.' \
    '  --help, -h  Show this help.' \
    '' \
    'Examples:' \
    '  pnpm db:reset' \
    '  pnpm db:reset --yes' \
    '  pnpm db:reset --dry-run'
}

confirmed=false
dry_run=false
for argument in "$@"; do
  case "$argument" in
    --help | -h)
      print_help
      exit 0
      ;;
    --yes)
      confirmed=true
      ;;
    --dry-run)
      dry_run=true
      ;;
    *)
      printf 'Error: Unexpected argument: %s\n' "$argument" >&2
      printf '  Example: pnpm db:reset --yes\n' >&2
      exit 2
      ;;
  esac
done

if [[ "$dry_run" == true ]]; then
  printf '%s\n' \
    'status: dry-run' \
    'target: local Supabase database' \
    'source: migrations and seed data'
  exit 0
fi

if [[ "$confirmed" != true ]]; then
  if [[ ! -t 0 ]]; then
    printf 'Error: Database reset requires confirmation in a non-interactive session.\n' >&2
    printf '  Run: pnpm db:reset --yes\n' >&2
    exit 2
  fi

  printf 'Reset the local Supabase database? [y/N] '
  read -r response
  if [[ "$response" != y && "$response" != Y ]]; then
    printf 'status: cancelled\n'
    exit 0
  fi
fi

cd "$repository_root"
bash scripts/run-local-supabase.sh start >/dev/null
bash scripts/run-local-supabase.sh db reset --local --yes

printf '%s\n' \
  'status: reset' \
  'target: local Supabase database'
