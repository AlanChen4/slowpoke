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

## Recover missing Claude prompt models

Claude user-prompt events omit the model. Ingestion fills it from the first
available API request with the same organization, installation, session, and
prompt IDs. Prompts without a matching request remain unknown.

After merging and deploying the ingestion fix, run this one-time SQL command
in the production SQL editor as `postgres`. It repairs Lumos Fellows' historical
prompts, changes only null models, and returns the number of updated prompts.
It can be rerun safely. Prompts without matching API events remain unknown.

```sql
with request_models as (
  select distinct on (installation_id, conversation_id, prompt_id)
    organization_id,
    installation_id,
    conversation_id,
    prompt_id,
    btrim(model) as model
  from public.response_usage_events
  where organization_id = '01320ba3-adcc-46b2-8cfa-5933c8073edb'::uuid
    and provider = 'anthropic'
    and nullif(btrim(model), '') is not null
    and nullif(conversation_id, '') is not null
    and nullif(prompt_id, '') is not null
  order by installation_id, conversation_id, prompt_id, event_timestamp, model
),
updated as (
  update public.prompt_events as prompt
  set model = request.model
  from request_models as request
  where prompt.organization_id = request.organization_id
    and prompt.installation_id = request.installation_id
    and prompt.session_id = request.conversation_id
    and prompt.prompt_id = request.prompt_id
    and prompt.provider = 'anthropic'
    and prompt.model is null
  returning prompt.id
)
select count(*) as recovered_prompts from updated;
```

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
