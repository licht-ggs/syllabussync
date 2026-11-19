# Phase 1.2 authentication architecture

## Flow and boundaries

- The React SPA uses the existing `@supabase/supabase-js` client with the
  PKCE flow and Supabase-managed session persistence/refresh.
- Email registration stores the preferred name as Auth user metadata
  `display_name`; the app always presents the verification-pending route after
  registration. The email callback exchanges the one-time PKCE code before
  entering the protected area.
- Google OAuth uses Supabase Auth and the same callback. The callback does not
  require a separate SyllabusSync email verification step for Google users.
- Recovery requests display a generic response. A recovery code is exchanged
  before the reset screen; the app only renders its password-update form when
  the exchanged user has the email provider. Google-only users are directed to
  Google recovery.
- The frontend protects the dashboard for user experience. It is not an
  authorization boundary.
- `apps/api` verifies bearer tokens with `auth.getUser(token)`. The profile
  route derives the owner ID from the verified Supabase user and forwards that
  user's bearer token in a publishable-key Supabase client.
- PostgreSQL RLS restricts profile reads and updates to `auth.uid() = id`.
  Authenticated clients cannot insert profiles directly.

## Profile creation

The profile migration creates one row per `auth.users.id`. Its
`SECURITY DEFINER` trigger uses an empty search path, fully qualifies the target
table, runs as `postgres`, and has execute privileges revoked from client
roles. It prefers registration `display_name`, then available provider name
metadata, then an email local-part fallback.

## Security decisions

- No service-role key is used by the frontend or ordinary API requests.
- No passwords, access tokens, refresh tokens, or OAuth credentials are logged.
- Redirect destinations are derived from the current app origin and a fixed
  callback path, never from user input. Supabase's URL allowlist remains the
  authoritative redirect restriction.
- Sign-in and recovery responses avoid revealing whether an email is
  registered. During Phase 1.2 the app offers no account linking, provider
  changes, automatic account merging, or flow for adding a password to a
  Google-only account. Email/password users use email/password; Google-only
  users use Google sign-in and Google's account recovery.
- The browser's PKCE verifier and session are held by the Supabase SDK. This
  SPA remains responsible for standard browser XSS protection.

## Supabase provider-policy limitation

The provider check on the reset screen is a UI guard, not a server-side
credential policy. `resetPasswordForEmail()` accepts an email address rather
than a provider; the current upstream GoTrue `/recover` handler finds a user by
email and calls the recovery-email sender without checking the provider. Thus a
Google-only account may receive a SyllabusSync recovery email. After code
exchange, this app does not render the password form for that account.

Supabase documents `updateUser({ password })` as a way to add password
authentication to an OAuth account. The Auth API accepts this for a signed-in
non-SSO user, and Supabase's Auth source includes tests for setting a first
password on an OAuth account. A Google-only user can therefore call the public
Auth API directly with a valid session even though SyllabusSync exposes no UI
for it. The repository has no server-side control that enforces the approved
provider restriction. No hosted project was used to test these behaviors; a
hard server-side prohibition remains unresolved.

Supabase documents that `signUp()` for an email already used by an OAuth
account returns an obfuscated user response without sending a verification
email. The current registration flow therefore does not link that existing
Google-only account to a password identity.

Supabase also documents automatic linking of OAuth identities with matching
email addresses. SyllabusSync currently exposes only Google as an OAuth
provider; the hosted project must not enable additional OAuth providers during
Phase 1.2. The app does not call `linkIdentity()` or `unlinkIdentity()`.

References: Supabase [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[updating a user](https://supabase.com/docs/reference/javascript/auth-updateuser),
and [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
Reviewed upstream Auth source at
[10ef107](https://github.com/supabase/auth/commit/10ef10789d1ee4fb422b448047e67e3e264c0482):
[recover.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/recover.go),
[mail.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/mail.go),
[user.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/user.go),
and [email_identity_on_password_test.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/email_identity_on_password_test.go).

## External setup

The local Supabase config enables only the Google OAuth provider, uses
environment references for its Client ID and Client Secret, and allows the
Vite callback at `http://localhost:5173/auth/callback`. Google Cloud Console
must authorize `http://localhost:5173` as a JavaScript origin and
`http://127.0.0.1:54321/auth/v1/callback` as the redirect URI for the local
Supabase Auth service.

Hosted Google credentials, email-confirmation policy, site URL, callback
redirect allowlist, and confirmation/recovery templates remain separate
settings configured in the Supabase Dashboard. No hosted-project settings
were changed or verified as part of the local setup. See
[LOCAL_SETUP.md](../development/LOCAL_SETUP.md).

## Phase boundary

Phase 1.2 does not require academic profile onboarding or institution details.
The later Phase 1.3 academic workspace is documented separately in
[PHASE_1_3_ACADEMIC_WORKSPACE.md](./PHASE_1_3_ACADEMIC_WORKSPACE.md).
