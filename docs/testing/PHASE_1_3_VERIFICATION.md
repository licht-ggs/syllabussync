# Phase 1.3 academic workspace verification

## Scope and implementation summary

Phase 1.3 adds the academic workspace foundation: academic years, academic
periods, subjects, explicit current-period selection, archiving/restoring, and
reviewed permanent deletion. It does not implement later-phase academic tasks,
calendars, documents, OCR, AI extraction, or workload features.

The implementation adds:

- An additive migration for owner-scoped academic tables, constraints,
  owner-only read policies, and authenticated RPCs. RPCs derive ownership from
  `auth.uid()`, use an empty `search_path`, and recheck deletion counts and
  timestamps before permanent deletion.
- Shared Zod schemas for academic inputs, returned workspace data, and
  deletion-review results.
- Authenticated API routes that scope reads to the verified user and perform
  writes through the RPCs. The API does not accept a client-supplied owner ID
  for mutations or return raw database/provider errors.
- A protected dashboard workspace for managing years, periods, and subjects,
  selecting the current period, and restoring archived records. Permanent
  deletion requires a fresh review, a five-second countdown, and explicit
  confirmation.

The Phase 1.3 migration was applied to the isolated local Supabase database
only. No hosted Supabase project was migrated, tested, reset, or otherwise
changed.

## Files changed during this assignment

- `README.md`
- `apps/api/src/app.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/academic.test.ts`
- `apps/api/src/routes/academic.ts`
- `apps/web/src/features/dashboard/AcademicWorkspace.test.tsx`
- `apps/web/src/features/dashboard/AcademicWorkspace.tsx`
- `apps/web/src/features/dashboard/DashboardPage.tsx`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/PHASE_1_2_AUTHENTICATION.md`
- `docs/architecture/PHASE_1_3_ACADEMIC_WORKSPACE.md`
- `docs/development/LOCAL_SETUP.md`
- `docs/testing/PHASE_1_3_VERIFICATION.md`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas/academic.test.ts`
- `packages/shared/src/schemas/academic.ts`
- `supabase/migrations/20261119030000_create_academic_workspace.sql`
- `supabase/tests/academic_workspace.test.sql`

No dependency manifests or lockfiles were changed.

## Automated verification

Checks were run in the current WSL2 workspace after the final code changes.

| Command                                                           | Result                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm --filter @syllabussync/api test`                            | PASS — 20 API tests.                                                   |
| `pnpm typecheck`                                                  | PASS — shared, API, and web packages.                                  |
| `pnpm lint`                                                       | PASS. The non-blocking `MODULE_TYPELESS_PACKAGE_JSON` warning remains. |
| `pnpm test`                                                       | PASS — 55 tests: shared 12, API 20, web 23.                            |
| `pnpm build`                                                      | PASS.                                                                  |
| `pnpm exec prettier --check` on changed source and Markdown files | PASS.                                                                  |
| `git diff --check`                                                | PASS for tracked changes.                                              |

Combined application and database automated tests: **109 passed** (55
application tests and 54 pgTAP assertions).

The build reports non-blocking dependency annotation warnings and a Vite
bundle-size warning (the main JavaScript chunk is about 876 kB uncompressed).
These warnings did not fail the build.

## Local database verification

| Check                   | Result                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment             | Ubuntu 26.04.1 under WSL2; kernel `6.18.58.1-microsoft-standard-WSL2`.                                                                          |
| Docker Desktop / Engine | PASS — Docker Desktop 4.99.0, Docker Engine 29.9.3. Windows and Ubuntu used Engine ID `f4d965d7-f05e-43a1-8a67-c0f44ad2c160`.                   |
| Supabase CLI            | PASS — Supabase CLI 3.2.0 via `pnpm dlx`.                                                                                                       |
| Local PostgreSQL        | PASS — PostgreSQL 17.12 at `127.0.0.1:54322`.                                                                                                   |
| pgTAP                   | PASS — version 1.3.3; available to the test, which creates it with `CREATE EXTENSION IF NOT EXISTS`.                                            |
| Local migrations        | PASS — `20261118180000_create_profiles.sql` and `20261119030000_create_academic_workspace.sql` are applied and match the local migration files. |
| Focused pgTAP command   | `pnpm dlx supabase test db --local supabase/tests/academic_workspace.test.sql` — PASS, 54 assertions passed, 0 failures.                        |
| Transaction and cleanup | PASS — test runs from `BEGIN` through final `ROLLBACK`; an independent read-only query returned 0 rows for each of the six checked categories.  |

The six post-test cleanup checks covered `auth.users`, `profiles`,
`academic_years`, `academic_periods`, `subjects`, and `workspace_settings`,
including academic records associated with both test users and the fixed
seeded year/period IDs.

The local Supabase status advertised service endpoints at `127.0.0.1`, but
Docker reported published ports bound to `0.0.0.0` and `[::]`. This can make
the local development services reachable through non-loopback interfaces,
depending on host networking and firewall rules. Networking configuration was
not changed as part of this verification; avoid exposing the development
stack to untrusted networks.

## Security review

- Authenticated API reads use the verified user's ID and bearer token.
  Mutation routes call owner-deriving RPCs; request bodies do not supply
  ownership.
- Direct authenticated table mutations are revoked. Table ownership is
  reinforced by composite foreign keys, and row-level policies limit reads to
  the owner.
- Security-definer RPCs use an empty `search_path`, reject a missing
  `auth.uid()`, and are executable by `authenticated` only. Trigger and
  function privileges were reviewed in the migration.
- Permanent deletion is limited to archived eligible records. The database
  rechecks the reviewed count and `updated_at` value under a row lock; the API
  returns a safe conflict result if the summary is stale.
- No application or database credential was added by this assignment. No
  hosted configuration, `.env`, or hosted database data was changed.

These are code-inspection findings, not a penetration test or a live database
security test.

## Database verification and manual integration

- The local stack was started with the Supabase CLI. It applied both
  chronological migrations to the local database; no migration was manually
  reapplied.
- `supabase/tests/academic_workspace.test.sql` ran against the local stack with
  `--local`. All 54 planned assertions passed.
- The test covers schema/table existence, grants, RPC privileges, row-level
  ownership isolation, Unicode/case/dash name normalization, date validation,
  current-period selection and archive behavior, subject archive state,
  deletion restrictions and stale-review handling, and Auth-user cleanup.
- The test begins with `BEGIN`, inserts two fixed test users and associated
  academic fixtures, calls `finish()`, and ends with `ROLLBACK`. The independent
  post-test SELECT checks returned zero rows for both test users and their
  associated profiles, years, periods, subjects, and workspace settings.
- The `supabase/config.toml` local Auth configuration was inspected. The local
  database endpoint used was `127.0.0.1:54322`.
- No hosted database test, migration, reset, or other hosted Supabase operation
  was performed. No `--remote`, `--linked`, `db push`, or `db reset` command was
  used.
- No concurrent database test was run. Locking behavior under concurrent
  selection, archival, and deletion-summary changes remains unverified.
- Local application/browser integration checks against the running Supabase
  stack were not performed. No production deployment or production database
  verification occurred.

Previously established Phase 1.2 hosted checks are not Phase 1.3 evidence and
are not repeated here.

## Remaining work and acceptance assessment

**Assessment: READY WITH DOCUMENTED LIMITATIONS for formal Phase 1.3
acceptance.** The application suite and local migration/pgTAP verification
passed, including a clean post-rollback check. This assessment is not a claim
of production readiness.

Remaining limitations:

- Concurrency behavior was not tested with concurrent database sessions.
- Local browser/API integration against the running Supabase stack was not
  performed.
- Docker-published development service ports were reported bound to `0.0.0.0`
  and `[::]`; exposure depends on host networking and firewall configuration.
  The stack should not be exposed to untrusted networks.
- Remote GitHub Actions and production deployment/environment behavior were
  not verified.
- Existing non-blocking lint/build warnings listed above remain.

No hosted Supabase test, migration, reset, or production verification is
claimed.
