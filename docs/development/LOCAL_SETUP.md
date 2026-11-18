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

The migration in `supabase/migrations` creates profiles, an Auth user trigger,
and owner-only RLS policies. Apply it with the Supabase CLI after linking the
intended project and reviewing the migration.

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

The app never accepts a user-supplied return URL. Google credentials remain in
the Supabase Dashboard; do not put them in `.env` or source control. Configure
the Supabase Dashboard before attempting hosted authentication.

## Troubleshooting

- If pnpm reports an unsupported package manager version, enable Corepack or
  install pnpm 12.21.0.
- If the API reports invalid configuration, check `PORT` and ensure both
  `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set together.
- The health endpoint does not test Supabase connectivity.
- If an Auth redirect is rejected, verify that the exact callback origin and
  path are allowed in the Supabase Dashboard.
