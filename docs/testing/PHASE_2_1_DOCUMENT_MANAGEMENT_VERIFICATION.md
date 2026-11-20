# Phase 2.1 — Document Management Verification

> **Verification update (2026-11-20):** The migration and pgTAP coverage were
> subsequently exercised in the task-created isolated local Supabase
> database. The direct SQL run passed 14/14 assertions. The CLI loopback
> runner remains unavailable in this environment. The original database
> section below is superseded by this update and the consolidated
> [Phase 2 implementation status](PHASE_2_IMPLEMENTATION_STATUS.md).

## Scope implemented

This first implementation slice adds authenticated PDF syllabus upload,
document listing and details, authorized PDF retrieval, retry of a failed
upload using the original file, and student-requested deletion. Documents use
a private Supabase Storage bucket, owner-scoped storage policies, and
owner-checked metadata operations. PDF content is parsed server-side before
storage; filenames and file content are validated. No OCR, text extraction,
third-party AI, consent capture, or task-candidate processing is implemented
in this slice.

The initial parser guards are 20 MiB and 200 pages. Synthetic parser-boundary
tests accepted a valid 20 MiB PDF and a 200-page PDF, and rejected a document
over either limit. These tests validate parser behavior at the configured
boundaries; they are not a representative production load or memory benchmark.

## Verification results

- Focused document API suite: **7 tests passed**.
- Full API suite: **40 tests passed** across 7 files.
- Focused document UI and app-shell suites: **7 tests passed**.
- Full web suite: **63 tests passed** across 9 files.
- Shared schema suite: **23 tests passed** across 5 files.
- Repository typecheck: **passed**.
- Repository lint: **passed**. ESLint emitted the existing
  `MODULE_TYPELESS_PACKAGE_JSON` warning.
- API and web production builds: **passed**. Vite reported a 963.44 kB
  minified JavaScript chunk (258.84 kB gzip), plus dependency annotation
  notices.
- Prettier check on changed TypeScript/package files: **passed**.
- `git diff --check`: **passed**, with existing CRLF normalization warnings
  in other working-tree files.

## Database verification and deployment state

The migration `20261120100000_create_academic_documents.sql` and its pgTAP
test were applied/executed against the isolated local Supabase database using
`psql` inside its PostgreSQL container. All 14 assertions passed, covering
table privileges, private bucket configuration, owner reads, protected
registration, storage path ownership, cross-user access denial, and deletion
state transitions. The Supabase CLI test runner could not connect over the
host loopback in this environment, so the tests were not run through
`supabase test db`. The isolated database's migration ledger was not used to
record the direct migration invocation. Deployment readiness still requires
a clean supported migration workflow and environment-specific verification.

No reset or destructive database command was run. No commit or push was made.
