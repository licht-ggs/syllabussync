# Phase 1.2 final verification

This report covers the Phase 1.2 authentication and student-profile foundation
in the Ubuntu WSL2 workspace. It does not cover Phase 1.3. Hosted integration
checks below were established previously; they were not repeated during this
autonomous review.

## Implementation summary

- Email/password and Google authentication use Supabase Auth with the browser
  SDK's PKCE flow. Email registration stores `display_name`, and email users
  are directed to verification.
- Signup now routes to Verification Pending after account creation even when
  sign-out returns an error or throws. It preserves the email and displays an
  informational notice; the form is not left available for another request.
- The API verifies bearer tokens with Supabase Auth and uses the verified
  user's token and ID for profile access. It does not use a service-role key.
- Profile reads and display-name-only updates are owner-scoped by RLS. Profile
  creation uses the restricted Auth trigger.
- The API's generic 500 handler now logs only the error class name, not the
  error object, message, or attached request data.

### Files changed during this autonomous assignment

- `apps/api/src/middleware/error-handler.ts`
- `apps/api/src/middleware/error-handler.test.ts`
- `apps/web/src/features/auth/pages/SignUpPage.test.tsx`
- `docs/testing/PHASE_1_2_VERIFICATION.md`

Other Phase 1.2 work was already present in the dirty worktree and was left
untouched.

## Automated verification

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS. Lockfile was current; pnpm used the project-local store because the configured external store could not be hard-linked. Supply-chain policy verification passed. |
| `pnpm typecheck` | PASS for shared, API, and web packages. |
| `pnpm lint` | PASS. Non-blocking `MODULE_TYPELESS_PACKAGE_JSON` warning remains. |
| `pnpm test` | PASS — 37 tests: shared 9, API 12, web 16. |
| `pnpm build` | PASS. Dependency annotation and Vite bundle-size warnings remain non-blocking. |
| `git diff --check` | PASS. Git printed existing CRLF-normalization warnings. |

Focused authentication checks also passed:

- `pnpm --filter @syllabussync/web test` — 16 tests: 9 signup and 7 recovery.
- `pnpm --filter @syllabussync/api test` — 12 tests, including the sanitized
  error-log regression test.

The signup tests cover invalid input, rate limiting, returned and thrown
errors, existing-account privacy, verification navigation/resend, and sign-out
failures with both returned errors and rejected promises.

## Security review

- No hardcoded service-role key, Google client secret, Gmail/SMTP password, or
  access/refresh token literal was found in the repository scan. A scan match
  for `accessToken` is the expected request-scoped bearer token in the profile
  API, not a stored credential.
- `.env` exists locally and is ignored; it was not read. No `.env` file is
  tracked. `.env.example` contains blank placeholders only.
- `supabase/.temp/` exists as ignored local Supabase CLI state; no CLI
  temporary files are tracked. Its contents were not read or changed.
- The API returns generic errors and does not return raw Supabase errors.
  Previously, its 500 handler logged entire errors, potentially including
  messages or attached request data. It now logs only the error name; an
  automated regression test verifies message/body/token-shaped data is not
  logged.
- API profile ownership comes from the verified Supabase user, not request
  parameters. The API forwards that user's token to a publishable-key client;
  no service-role access is used.
- The migration revokes client table privileges before granting `SELECT` and
  `UPDATE (display_name)`. The RLS policies scope reads and updates to
  `auth.uid() = id`; profile insertion is trigger-only. Trigger security
  definer/search-path protections were inspected.
- Google-only accounts have no password-adding UI or account-linking flow in
  SyllabusSync. This is not a server-enforced restriction: Supabase Auth
  supports direct `updateUser({ password })` calls for an OAuth account with a
  valid session. `resetPasswordForEmail()` is email-based, and the recovery
  screen blocks Google-only users after callback exchange. This limitation
  remains documented in the authentication ADR and architecture guide.
- Migration `20261118180000_create_profiles.sql` was previously applied
  successfully to the hosted Supabase development/testing project, as confirmed
  by the remote migration list. It was not reapplied during the latest
  autonomous verification assignment. pgTAP was not run.

## Previously established manual hosted integration checks

These are manual checks reported from the hosted Supabase development/testing
project, not automated tests and not re-run during this assignment:

- Email/password registration, verification email delivery/confirmation,
  sign-in, and session handling.
- Google OAuth with a configured test account; Google and email/password
  accounts remained separate.
- Password recovery email delivery and successful reset.
- Profile creation trigger for email/password and Google accounts.
- Protected dashboard route, session persistence, and authenticated profile
  retrieval.
- Owner-only profile reads and updates through authenticated-role SQL
  simulation.
- Express API returned the current authenticated user's profile.
- Custom Gmail SMTP successfully delivered a recovery email.

## Remaining limitations and unverified items

- `supabase/tests/profile_rls.test.sql` exists but has not been executed through
  pgTAP. The authenticated-role SQL simulation is not a pgTAP result.
- Remote GitHub Actions have not been verified.
- Browser-based OAuth, email delivery, hosted authentication, and profile
  integration were not retested during this assignment.
- Production deployment and production-environment testing have not occurred.
  The hosted Supabase project used for the manual checks is a development/
  testing environment, not a separate production environment.
- Signup errors are covered by automated tests, but SMTP delivery errors
  outside the tested cases are not guaranteed.
- A hard server-side prohibition on Google-only users adding a password is not
  implemented. If that is required for acceptance, it needs a separate
  security design decision; this review did not add privileged endpoints or
  change Supabase configuration.

## Acceptance assessment

**READY WITH DOCUMENTED LIMITATIONS**, subject to acceptance of the
Google-only direct-Auth-API limitation. The application behavior and local
automated checks pass, but pgTAP, remote CI, production, and current hosted
integration checks remain unverified. If Phase 1.2 requires a technical
server-side guarantee against direct Supabase Auth API calls, that requirement
is not met and formal acceptance should wait for a separately approved design.

No additional automated commands are required. If pgTAP verification is
requested, run `supabase test db` only against an isolated local database, not
the hosted development or production project.
