# Deploy backend and Collector

After relevant changes reach `main`, GitHub Actions deploys only the changed
Modal app. Each app has its own test, secret sync, deployment, and rollover job;
the backend job also checks backend health. Run the `Deploy Modal` workflow
manually to deploy both apps after secrets change. Deploy database migrations
separately.

## Secret ownership

Doppler project `backend`, config `prd`, is the source of truth. Modal stores a
filtered copy for each app:

| Doppler variable         | `slowpoke-backend` | `slowpoke-collector` |
| ------------------------ | ------------------ | -------------------- |
| `SLOWPOKE_INGEST_TOKEN`  | Yes                | Yes                  |
| `SUPABASE_URL`           | Yes                | No                   |
| `SUPABASE_SECRET_KEY`    | Yes                | No                   |
| `SLOWPOKE_OTLP_HTPASSWD` | No                 | Yes                  |
| `SLOWPOKE_INGEST_URL`    | No                 | Yes                  |

`scripts/sync-modal-secrets.sh --service <backend|collector>` enforces this
allowlist. Keep application secrets in Doppler. GitHub stores only Doppler and
Modal credentials.

## GitHub Production environment

- Secrets: `DOPPLER_TOKEN`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`
- Variables: `DOPPLER_PROJECT`, `DOPPLER_CONFIG`, `MODAL_ENVIRONMENT`,
  `SLOWPOKE_BACKEND_URL`, `SLOWPOKE_COLLECTOR_URL`

Doppler changes do not update Modal immediately. Run the deployment workflow to
copy new values and replace running containers.
