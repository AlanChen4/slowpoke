# Deploy backend and Collector

After relevant changes reach `main`, GitHub Actions deploys only the changed
Modal app. Each app has its own test, secret sync, deployment, and rollover job;
the backend job also checks backend health. Run the `Deploy Modal` workflow
manually to deploy both apps after secrets change. Deploy database migrations
separately.

## Secret ownership

Doppler project `backend`, config `prd`, is the source of truth. Modal stores a
filtered copy for each app:

| Doppler variable                            | Backend | Collector |
| ------------------------------------------- | ------- | --------- |
| `SLOWPOKE_INGEST_TOKEN`                     | Yes     | Yes       |
| `SUPABASE_URL`                              | Yes     | No        |
| `SUPABASE_SECRET_KEY`                       | Yes     | No        |
| `SLOWPOKE_INSTALLATION_ISSUER`              | Yes     | Yes       |
| `SLOWPOKE_COLLECTOR_AUDIENCE`               | Yes     | Yes       |
| `SLOWPOKE_COLLECTOR_URL`                    | Yes     | No        |
| `SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY` | Yes     | No        |
| `SLOWPOKE_INSTALLATION_SIGNING_KID`         | Yes     | No        |
| `SLOWPOKE_INGEST_URL`                       | No      | Yes       |

`scripts/sync-modal-secrets.sh --service <backend|collector>` enforces this
allowlist. Keep application secrets in Doppler. GitHub stores only Doppler and
Modal credentials.

## GitHub Production environment

- Secrets: `DOPPLER_TOKEN`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`
- Variables: `DOPPLER_PROJECT`, `DOPPLER_CONFIG`, `MODAL_ENVIRONMENT`,
  `SLOWPOKE_BACKEND_URL`, `SLOWPOKE_COLLECTOR_URL`

Doppler changes do not update Modal immediately. Run the deployment workflow to
copy new values and replace running containers.

## Installation signing configuration

Set `SLOWPOKE_INSTALLATION_ISSUER` to the public HTTPS backend origin. Set
`SLOWPOKE_COLLECTOR_URL` to the public HTTPS OTLP origin. Use one stable value
for `SLOWPOKE_COLLECTOR_AUDIENCE` in both services.

Generate an RSA private key in a secure environment. Store the PKCS8 PEM value
only in Doppler as `SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY`. Set a stable,
non-secret key ID in `SLOWPOKE_INSTALLATION_SIGNING_KID`. The backend publishes
only the public key through JWKS.

Deploy the backend before the Collector. Confirm that the discovery document
and JWKS use the production issuer. Then deploy the Collector and run a new
installation through onboarding.

Replacing the signing key invalidates existing installation tokens. Plan a
re-enrollment window before changing the key or key ID.

## Setup package publishing

The `Publish setup package` workflow publishes `@slowpokeai/setup` after a
change to the package reaches `main`. Increase the version in
`packages/setup/package.json` for each release.

Create the `slowpokeai` organization on npm before the first release. Create a
GitHub environment named `npm`, then add an `NPM_TOKEN` environment secret that
can publish public packages in the `@slowpokeai` scope. The first merge publishes
the package with public access.

After the first release, configure `@slowpokeai/setup` to trust the GitHub
Actions workflow `publish-setup.yml` in `AlanChen4/slowpoke`. Set the environment
name to `npm` and allow `npm publish`. Trusted publishing uses the workflow's
OpenID Connect identity and adds npm provenance. Remove `NPM_TOKEN` after the
trusted publisher succeeds.

The web deployment also requires `SLOWPOKE_SETUP_SERVER`. Set it to the public
HTTPS backend origin used by the setup command.
