#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
HOOK_MODE=false

if [[ "${1:-}" == "--hook" ]]; then
  HOOK_MODE=true
fi

cd "$PROJECT_ROOT"

failed=0

run_check() {
  local label="$1"
  shift

  if [[ "$HOOK_MODE" == true ]]; then
    local output

    if output="$("$@" 2>&1)"; then
      return
    fi

    printf '%s failed:\n%s\n' "$label" "$output" >&2
    failed=1
    return
  fi

  printf '\n%s\n' "$label"
  if ! "$@"; then
    failed=1
  fi
}

run_check "Lint" pnpm lint
run_check "Formatting check" pnpm format:check

if [[ "$failed" -ne 0 ]]; then
  if [[ "$HOOK_MODE" == true ]]; then
    exit 2
  fi

  exit 1
fi
