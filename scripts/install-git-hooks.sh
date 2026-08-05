#!/usr/bin/env bash

set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

configured_path="$(git config --get core.hooksPath || true)"

if [[ -n "$configured_path" && "$configured_path" != ".githooks" ]]; then
  printf 'Git hooks not installed: core.hooksPath is already %q\n' "$configured_path" >&2
  printf 'PR metadata remains enforced by GitHub Actions.\n' >&2
  exit 0
fi

git config core.hooksPath .githooks
