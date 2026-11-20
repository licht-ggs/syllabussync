# Local setup

## Prerequisites

- Node.js 26
- pnpm 12.21.0

## Install and configure

1. Run `pnpm install`.
2. Copy `.env.example` to `.env` and set the Supabase project URL and
   publishable key. Never use a secret or service-role key in browser code or
   commit real credentials. Both apps read the root `.env`; frontend variables
   must begin with `VITE_`.

The API starts without Supabase credentials for its health endpoint. If either
backend Supabase setting is supplied, both must be supplied. Auth features need
valid values for both frontend and backend settings.

## Commands

- `pnpm dev` — run web and API concurrently.
- `pnpm dev:web` / `pnpm dev:api` — run an app independently.
- `pnpm test` — run focused unit and API tests.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` — quality checks.

The web development server is provided by Vite (default port 5173); the API
defaults to port 3000 and serves `GET /api/health`.

## Supabase Auth setup

The migrations in `supabase/migrations` create profiles and the academic
workspace tables, functions, triggers, and RLS policies. Review migrations
before applying them. For local database verification, start the local Supabase
stack, apply migrations, and run pgTAP only against that isolated local
database:

```sh
supabase start
supabase db reset
supabase test db
```

`supabase db reset` is destructive to its target database. Do not run it
against a hosted project. The Phase 1.3 academic migration has not been applied
to hosted Supabase; do not treat code-level checks as database verification.

### Local Google OAuth

The local Supabase configuration enables Google OAuth. When accessing Vite
from Windows through WSL2, set `auth.site_url` in `supabase/config.toml` to
the current WSL IP origin (for example, `http://172.18.131.69:5173`) and
include the exact `/auth/callback`, `?flow=signup`, and `?flow=recovery`
callback URLs for that origin in `auth.additional_redirect_urls`. The app
builds these callback URLs from the browser's current origin; do not hardcode a
WSL IP in application code. Keep the localhost callback entries too if local
browsers also access the app through localhost.

`site_url` is GoTrue's fallback when the requested redirect is not accepted.
Seeing the correct `redirect_to` in the browser's initial authorize request
only confirms what the client sent; it does not prove that the running local
Auth service loaded the corresponding allow-list. After changing
`supabase/config.toml`, stop and start the local Supabase stack from the
repository root so the CLI regenerates service configuration. Do not reset
the database. Check that the local Auth service is responding and then retry
the OAuth flow; the callback must return to the requested `/auth/callback`
URL, not the `site_url` root.

The Google provider's Client ID and Client Secret are read only by the local
Supabase CLI process through these environment variables:

- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`

Set them in the shell used to start/restart the local stack; do not add them to
the repository, root `.env`, or hosted Supabase configuration. For example,
the prompts below do not echo the values:

```sh
read -r -s -p "Local Google OAuth Client ID: " SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID
printf '\n'
read -r -s -p "Local Google OAuth Client Secret: " SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET
printf '\n'
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET
```

In Google Cloud Console, configure the OAuth client as a **Web application**:

- Authorized JavaScript origin: the frontend origin used by the browser
  (for example, `http://172.18.131.69:5173`)
- Authorized redirect URI: `http://127.0.0.1:54321/auth/v1/callback`

The Google redirect URI is the local Supabase Auth callback, not the Vite
`/auth/callback` route. SyllabusSync then redirects back to that Vite callback.

For a hosted Supabase project, configure these settings manually in the
Dashboard; they are not configured by this repository:

1. Enable email/password sign-up and require email confirmation.
2. Enable Google under **Authentication → Providers**. Create a Google OAuth
   web client and add its client ID and secret to the provider settings. Set the
   Google authorized redirect URI to the Supabase Auth callback URL shown by
   the provider configuration.
3. Set **Authentication → URL Configuration → Site URL** to the frontend
   origin. Add the exact callback redirects used by the app:
   `/auth/callback`, `/auth/callback?flow=signup`, and
   `/auth/callback?flow=recovery` on each approved origin. Avoid broad wildcard
   redirects in production.
4. Review the confirmation and recovery email templates. Their links must
   honor the configured redirect URL and return to the SyllabusSync callback.
5. Add only the required frontend origins and callback URLs. Do not treat the
   local URLs in `supabase/config.toml` as hosted-project settings.

During Phase 1.2, enable only Google as a social OAuth provider. The app does
not expose account linking or provider changes. Supabase can automatically link
OAuth identities with matching email addresses, so enabling additional OAuth
providers may merge identities contrary to the Phase 1.2 policy. See the
[authentication architecture](../architecture/PHASE_1_2_AUTHENTICATION.md) for
the password-recovery and server-side enforcement limitation.

The app never accepts a user-supplied return URL. Hosted Google credentials
remain in the Supabase Dashboard and must not be added to `.env` or source
control. The local environment variables above configure only the local
Supabase stack.

## Troubleshooting

- If pnpm reports an unsupported package manager version, enable Corepack or
  install pnpm 12.21.0.
- If the API reports invalid configuration, check `PORT` and ensure both
  `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set together.
- The health endpoint does not test Supabase connectivity.
- If an Auth redirect is rejected, verify that the exact callback origin and
  path are allowed in the Supabase Dashboard.
