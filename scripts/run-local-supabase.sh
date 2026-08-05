#!/usr/bin/env bash

set -euo pipefail

exec doppler run \
  --no-fallback \
  --project frontend \
  --config dev \
  --only-secrets SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID,SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET,SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID,SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET \
  -- pnpm exec supabase "$@"
