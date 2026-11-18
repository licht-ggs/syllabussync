# ADR: Supabase Auth for student accounts

- **Status:** Accepted for Phase 1.2
- **Decision:** Use Supabase Auth through the existing JavaScript SDK for
  email/password and Google sign-in. Use the SDK's PKCE authorization-code
  flow and a fixed SPA callback route.
- **Profile storage:** Keep application profile data in `public.profiles`, keyed
  by `auth.users.id`. Create it through a restricted `SECURITY DEFINER`
  trigger and protect rows with RLS.
- **API trust boundary:** Validate bearer tokens with Supabase Auth on
  protected API routes. Derive ownership from the verified token and use that
  token for RLS-scoped database requests.
- **Recovery and verification:** Require email confirmation in Supabase
  configuration. Keep recovery responses generic. SyllabusSync password reset
  is for email/password accounts; Google-only users use Google's account
  recovery.
- **Provider policy:** During Phase 1.2, email/password accounts use
  email/password, and Google-only accounts remain Google-only. The app does not
  expose account linking, provider changes, automatic account merging, or
  adding a password to a Google identity.
- **Alternatives rejected:** No separate auth framework, custom password
  storage, service-role access for student operations, username login, account
  linking, automatic account merging, or custom email-based identity merging.
- **Enforcement limitation:** The reset page checks the authenticated user's
  `app_metadata.providers` and does not render the password form for a
  Google-only user. This is a client-side UI guard, not an Auth-server policy.
  Supabase documents `resetPasswordForEmail()` as an email-based request, and
  its Auth source handles recovery by looking up the email without checking the
  provider. Supabase also documents `updateUser({ password })` as a way to add
  password authentication to an OAuth user. Therefore, a caller with a
  Google-only user's valid session can bypass the SyllabusSync UI and invoke
  the Auth API directly. A server-side prohibition is not implemented or
  verified; Phase 1.2 must not be described as enforcing this invariant beyond
  the app's normal UI.
- **Trade-offs:** Hosted Supabase provider, email, and redirect configuration
  remains an operator responsibility. The SPA uses SDK-managed browser session
  storage; API verification and RLS remain mandatory because client route
  guards are not security controls.

Supabase references:
[password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[updating a user](https://supabase.com/docs/reference/javascript/auth-updateuser),
and [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
The reviewed upstream Auth source is pinned at
[10ef107](https://github.com/supabase/auth/commit/10ef10789d1ee4fb422b448047e67e3e264c0482):
[recover.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/recover.go),
[mail.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/mail.go),
[user.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/user.go),
and [email_identity_on_password_test.go](https://github.com/supabase/auth/blob/10ef10789d1ee4fb422b448047e67e3e264c0482/internal/api/email_identity_on_password_test.go).

See [the authentication architecture](../architecture/PHASE_1_2_AUTHENTICATION.md)
and [local setup](../development/LOCAL_SETUP.md).
