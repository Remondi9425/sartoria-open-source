# Optional research deployment

The local demo needs no cloud service. The real engine is an optional research
integration with NLF/SMPL restrictions; read THIRD_PARTY_NOTICES.md first.

## Configure the engine

Install locked Python dependencies with `uv sync --locked` and authenticate to your
own Modal account using its CLI. Generate a secret locally, for example with
`python -c 'import secrets; print(secrets.token_urlsafe(32))'`. Do not commit it.
Create a Modal secret named `sartoria-token` with `SARTORIA_TOKEN_SECRET` using the
Modal dashboard. Configure the same value in the frontend's server environment.

Set `SARTORIA_ENV=production` and `SARTORIA_ALLOWED_ORIGINS` to your frontend origin
before running `uv run modal deploy modal_app.py`. The deployment defaults to
production; it does not enable unauthenticated development. A missing or blank
secret prevents API startup. Set `SARTORIA_VERCEL_PROJECT` only if preview-origin
matching is needed; explicit origins are preferable for a restricted service.

The model build downloads about 493 MB of weights and uses a T4 GPU at runtime.
Runtime CPU dependencies come from `requirements-runtime.txt`, exported from
`uv.lock`. Torch/torchvision are separately pinned for the existing CUDA/model
integration. No GPU inference or deployment is performed by ordinary CI.

## Configure the frontend

Copy `web/.env.example` to `web/.env.local` for local testing. Configure
`NEXT_PUBLIC_ENGINE_URL` with **your** deployment URL and `SARTORIA_TOKEN_SECRET`
with the matching secret. Rebuild after changing the URL: public variables are
bundled at build time. Set `SARTORIA_ENV=production` on the hosted frontend.

Deploy the updated API and client as a coordinated change. The API returns
`result_token` alongside `job_id`; polls need the original Bearer token and the
`X-Sartoria-Result-Token` header. Capabilities expire and cannot be used for another
job or with another submission token. Existing clients lacking this header must
be upgraded. Debug submissions use the same protocol.

For isolated local API development only, set both `SARTORIA_ENV=dev` and
`SARTORIA_ALLOW_INSECURE_DEV=1` to allow an absent secret. On the frontend this also
requires the Next.js development server. Do not expose that configuration publicly.

## Public-service work still required

The source can be studied and run locally, but unrestricted scans incur GPU costs
and process personal data. The token endpoint intentionally does not implement a
user login. Add an operator-selected access policy and shared quotas before an
unrestricted launch. Configure a trusted proxy to set forwarding headers; do not
assume client-supplied IP headers are trustworthy. Validate provider retention,
regions and deletion procedures, and update the user-facing notice accordingly.

## Optional Supabase keepalive

The app does not depend on Supabase. The optional workflow is disabled unless the
repository variable `ENABLE_SUPABASE_KEEPALIVE` equals `true`. Set repository
variable `SUPABASE_URL` and secret `SUPABASE_PUBLISHABLE_KEY` for your own project.
It calls an existing `public.heartbeat()` RPC; it does not create schema or policies.
Leave it disabled if no such RPC is configured. Never substitute a service-role
key. This source preparation does not change the live Supabase project.
