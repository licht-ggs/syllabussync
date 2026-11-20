# Phase 1.4 Stage 1 verification

## Scope

This report covers the Phase 1.4 Stage 1 database foundation only. Task API
routes, frontend task management, dashboard integration, and calendar UI were
not implemented in Stage 1.

## Initial preflight

The initial verification attempt could not reach the local database:

- The database runtime and local tools were unavailable to that execution
  environment.
- A read-only TCP probe to `127.0.0.1:54322` was refused.
- Migration application and database tests were not run during that attempt.

This was an environment limitation at preflight, not the final verification
result. No hosted Supabase project was accessed.

## Migration and schema

Migration `20261119135500_create_tasks_and_history.sql` is recorded as applied
to the local Supabase database. It adds
`workspace_settings.preferred_timezone`, owner-scoped `tasks` and
`task_history` tables, constraints, indexes, RLS policies,
timestamp/deadline/archive triggers, protected task/timezone functions, and
task-aware subject/period deletion functions. Existing migrations were not
rewritten.

Task types, priorities, and statuses follow the approved specification.
Timed deadlines require a caller-supplied instant consistent with the stored
local date, time, and IANA timezone. Nonexistent local times are rejected;
the chosen occurrence of an ambiguous repeated time is preserved.

## Local database verification

Command executed against the local Supabase stack:

```text
pnpm dlx supabase test db --network-id syllabussync_dev_network
```

Result: **3 files, 145 tests, all successful.**

| Test file                     | Result |
| ----------------------------- | ------ |
| `academic_workspace.test.sql` | PASS   |
| `profile_rls.test.sql`        | PASS   |
| `task_management.test.sql`    | PASS   |

These tests ran against the local Supabase stack. Hosted Supabase was not
connected to or modified. No migration reset was performed.

## Application verification

| Command            | Result                                         |
| ------------------ | ---------------------------------------------- |
| `pnpm typecheck`   | PASS                                           |
| `pnpm lint`        | PASS                                           |
| `pnpm test`        | PASS — 55 tests (Shared: 12, API: 20, Web: 23) |
| `pnpm build`       | PASS                                           |
| `git diff --check` | PASS                                           |

Non-blocking warnings:

- ESLint emitted `MODULE_TYPELESS_PACKAGE_JSON`.
- Vite reported a frontend bundle of approximately 875.86 KB uncompressed
  (243.58 KB gzip).
- Git reported CRLF-to-LF normalization for `supabase/tests/profile_rls.test.sql`.

## Security and concurrency status

The migration defines owner-read RLS policies, authenticated read-only grants
on tasks and history, restricted RPC execution, ownership derived from
`auth.uid()`, `SECURITY DEFINER` mutation functions with an empty
`search_path`, and revoked execution for internal helpers. The local pgTAP
suite passed its ownership, grants, RLS, history, mutation, and deletion
assertions.

Independent-session concurrency testing was **not performed**. The test
results do not verify lock behavior under concurrent database sessions.

## Acceptance status

**PASS WITH DOCUMENTED LIMITATIONS.** The Stage 1 migration is recorded as
applied locally, the three local pgTAP files passed all 145 tests, and the
application typecheck, lint, test, build, and whitespace checks passed.

The remaining verification limitation is independent-session concurrency
testing. No hosted Supabase operation was performed.
