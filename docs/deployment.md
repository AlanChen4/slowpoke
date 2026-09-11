# Production operations

Production state lives outside the repository. Keep this guide focused on the
configuration and rollout steps that cannot be inferred from application code.

## Modal

GitHub Actions deploys changed backend and Collector code from `main`. The
`Production` GitHub environment must provide:

- Secrets: `DOPPLER_TOKEN`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`
- Variables: `DOPPLER_PROJECT`, `DOPPLER_CONFIG`, `MODAL_ENVIRONMENT`,
  `SLOWPOKE_BACKEND_URL`, `SLOWPOKE_COLLECTOR_URL`

Doppler project `backend`, config `prd`, is the source of truth for application
configuration. `scripts/sync-modal-secrets.sh` defines the values copied to each
Modal app. GitHub stores only the credentials needed to read Doppler and deploy
to Modal.

Doppler changes do not update running services. After changing a value, run the
`Deploy Modal` workflow manually to sync both apps and replace their containers.
Deploy database migrations separately.

The old `SLOWPOKE_OTLP_USERNAME`, `SLOWPOKE_OTLP_PASSWORD`, and
`SLOWPOKE_OTLP_HTPASSWD` values are not used by production authentication.

## Installation authentication

Set `SLOWPOKE_INSTALLATION_ISSUER` to the public HTTPS backend origin and
`SLOWPOKE_COLLECTOR_URL` to the public HTTPS OTLP origin. Use the same stable
`SLOWPOKE_COLLECTOR_AUDIENCE` value in both services.

Generate an RSA private key in a secure environment. Store its complete PKCS8
PEM value only in Doppler as `SLOWPOKE_INSTALLATION_SIGNING_PRIVATE_KEY`. Set
`SLOWPOKE_INSTALLATION_SIGNING_KID` to a stable, non-secret identifier for that
key. The backend publishes only the public key through JWKS.

Replacing the signing key invalidates existing installation tokens. Schedule a
re-enrollment window before changing the private key or key ID. Verify the
backend discovery document and JWKS before rolling out Collector configuration
that depends on a new issuer or key.

## Web

Vercel requires `SLOWPOKE_SETUP_SERVER`. Set it to the public HTTPS backend
origin that setup commands can reach. Configure it for Production and for
Preview when preview deployments must build.

## Setup package publishing

Add a Changeset when a pull request changes `@slowpokeai/setup`. After the
change reaches `main`, the `Publish setup package` workflow creates or updates a
release pull request. Merging that pull request publishes the package, creates
a Git tag, and creates a GitHub release.

The npm package must trust this GitHub Actions identity:

- Organization: `slowpokeai`
- Package: `setup`
- Repository: `AlanChen4/slowpoke`
- Workflow: `publish-setup.yml`
- GitHub environment: `npm`

Trusted publishing uses GitHub OpenID Connect and does not require a long-lived
npm token.
