# SyllabusSync Project Context

This document is the durable starting point for future development sessions.
It summarizes current product decisions and repository facts; the linked
architecture and verification documents remain authoritative for detailed
technical behavior and test evidence.

## Product identity

**Name:** SyllabusSync

**Vision:** An AI-powered academic workload management platform that helps
university students organize, understand, and manage their entire semester.

**Tagline:** Understand your workload. Own your semester.

Target users are university and college students, instructors and professors,
academic coordinators, and educational institutions.

The broader product is intended to provide:

1. AI-powered syllabus and announcement reading.
2. Academic event and deadline extraction.
3. A unified academic calendar.
4. Workload analysis and forecasting.
5. Intelligent study scheduling.
6. An academic document-grounded assistant.
7. Deadline change detection.
8. Personalized workload recommendations.

These capabilities describe the product direction; they are not all currently
implemented.

## Product principles

- Build around validated real-world problems.
- Prioritize reliability, usability, security, and maintainability.
- Avoid unnecessary features and overengineering; preserve existing behavior.
- Implement incrementally and verify major changes.
- Keep the application mobile-first, responsive, and installable as a PWA.
- Protect student documents and personal information.
- AI-generated academic information must be verifiable against original
  sources. Students must approve extracted academic requirements, and AI must
  never silently change confirmed deadlines.

## Technology and repository architecture

The repository is a pnpm TypeScript monorepo. Its root manifest requires Node
`>=26`, specifies pnpm `12.21.0`, and uses a pnpm v9 lockfile. At the time this
document was created, the installed runtime was Node `26.13.0` and pnpm
`12.21.0`. Resolved package versions observed from the current lock/install
include React/React DOM `19.3.1`, React Router DOM `7.18.5`, Vite `7.3.8`,
Tailwind CSS `4.3.5`, TypeScript `5.9.3`, Express `5.3.0`, Supabase JS
`2.119.0`, Zod `4.6.7`, and Vitest `3.2.7`. Package manifests specify
compatible version ranges; use the lockfile for reproducible installs.

### Directory layout

- `apps/web` — React, TypeScript, Vite, Tailwind, browser routes, Supabase Auth
  session, and user interface. Source is under `src/app`, `src/features`,
  `src/lib`, and `src/styles`.
- `apps/api` — Express application, environment validation, authentication
  middleware, route handlers, and Supabase client services. Source is under
  `src/config`, `src/middleware`, `src/routes`, and `src/services`.
- `packages/shared` — shared Zod schemas and TypeScript contracts under
  `src/schemas`.
- `supabase` — local CLI configuration, SQL migrations, snippets, and pgTAP
  tests.
- `docs` — architecture, decisions, development setup, and verification
  reports.
- `.github/workflows/ci.yml` — repository CI workflow.

### Application boundaries and authentication

The web app owns browser rendering, routing, and the Supabase Auth session. It
uses the public publishable key; secrets and service-role keys must not enter
the browser bundle. The current app uses the declarative React Router
`BrowserRouter`. Its routes are:

- Public/auth: `/sign-in`, `/sign-up`, `/auth/forgot-password`,
  `/auth/verify`, `/auth/callback`, and `/auth/reset-password`.
- Protected: `/dashboard`, `/tasks`, `/tasks/:taskId`,
  `/tasks/:taskId/edit`, and `/archives`.

Email/password and Google sign-in use Supabase Auth and its PKCE session flow.
The callback uses a fixed application route. The API verifies bearer tokens
with Supabase Auth, derives the owner from the verified user, and uses that
user's token for RLS-scoped database access. The API does not use a
service-role key for student requests. Browser route guards are a user
experience boundary, not an authorization boundary.

API route groups currently include `/api/health`, `/api/profile`,
`/api/academic`, and `/api/tasks`. The health endpoint reports process
availability only. Inputs and cross-package contracts use shared Zod schemas;
database constraints and protected functions remain authoritative for data
integrity.

### Database organization

PostgreSQL is provided by Supabase. Profile records are keyed to
`auth.users.id`. Academic years, periods, subjects, workspace settings, tasks,
and task history are owner-scoped. RLS constrains reads; protected mutations
use database functions, constraints, and ownership derived from `auth.uid()`.
Task operations use optimistic versions. The task migrations preserve
date-only deadlines separately from timed deadlines and enforce the stored
local time, IANA timezone, and resolved instant relationship. See
[Phase 1.4 database foundation](architecture/PHASE_1_4_DATABASE.md) and the
migration files for exact definitions.

The user authorized Phase 2.1–2.5 implementation on 2026-11-20. Phase 2.1
document management and Phase 2.2 local PDF text/OCR processing are present.
Phase 2.3 now has strict candidate schemas, evidence validation, provider
abstraction, persistence, and student-review APIs, but no production AI
provider is configured. Third-party extraction remains disabled until provider
privacy terms, disclosure, consent capture, and processing configuration are
resolved. Phase 2.4 review/approval is implemented for persisted candidates;
Phase 2.5's synthetic baseline and security tests do not establish AI precision
or recall. See
[Phase 2 implementation status](testing/PHASE_2_IMPLEMENTATION_STATUS.md).

## Accepted development history

The supplied project history and current branch history mark Phases 1.1–1.3
complete. Phase 1.4 was accepted in the project conversation; its task
foundation and UI changes are present in the current working tree but remain
uncommitted at the time this context was written.

### Phase 1.1 — Infrastructure

Established the pnpm monorepo, TypeScript foundations, React/Vite frontend,
Express API, shared Zod schemas, environment validation, Supabase foundations,
testing/lint/format tooling, and CI. See
[Phase 1.1 verification](testing/PHASE_1_1_VERIFICATION.md).

### Phase 1.2 — Authentication

Established Supabase Auth with Google and email/password sign-in, bearer-token
verification, and RLS-based data access. Any student email is accepted; there
is no institution restriction. Registration does not collect institution or
program details. See the [authentication architecture](architecture/PHASE_1_2_AUTHENTICATION.md),
[authentication ADR](decisions/ADR-AUTHENTICATION.md), and
[Phase 1.2 verification](testing/PHASE_1_2_VERIFICATION.md).

### Phase 1.3 — Academic Workspace

Established academic years, periods, subjects, current-period selection,
archive/restore, and protected permanent deletion with ownership protections.
Registration does not require an institution, school, education level,
program, strand, or year level; account identity and academic workspace stay
separate. See the [workspace architecture](architecture/PHASE_1_3_ACADEMIC_WORKSPACE.md)
and [Phase 1.3 verification](testing/PHASE_1_3_VERIFICATION.md).

### Phase 1.4 — Tasks and Deadlines

The accepted Stage 1 foundation adds tasks, task history, workspace timezone
preference, owner-scoped RLS, protected database operations, optimistic
concurrency, and date/timezone/DST validation. Timed deadlines preserve
`due_date`, `due_time`, `due_timezone`, and `due_at TIMESTAMPTZ`; date-only
deadlines remain date-only.

The accepted API and task UI provide task CRUD and status operations, task
history, search/filter/sort, cursor pagination, subject reassignment, deadline
handling, unsaved-change protection, and conflict handling. UI/UX refinement
Stages A2–A5 add the responsive shell, mobile/desktop navigation, account menu,
collapsible workspace forms, dedicated Archives page, full-page Task Details,
separate Task Edit route, and URL-synchronized supported task filters and
cursor position. A stale task edit preserves the user's draft for review.

The UI refinement uses the existing declarative `BrowserRouter`. Browser
Back/Forward navigation is not protected against losing unsaved task edits;
this limitation was explicitly accepted. Do not migrate the router solely to
address it without approval.

Recorded final UI refinement verification:

- Web suite: 60/60 passed.
- Focused shell and task tests: 23 passed.
- Isolated API error-handler test: 1 passed (Vitest reported 2.16 seconds).
- Typecheck, lint, production build, and `git diff --check`: passed.
- A prior full concurrent API/web run had one API error-handler test timeout
  (32/33 API tests passed); the timed-out test passed when run independently.
- The production build reports a large JavaScript chunk of approximately
  949 kB uncompressed (about 257 kB gzip in the latest recorded output).
- ESLint emits the existing `MODULE_TYPELESS_PACKAGE_JSON` warning.

See the [database foundation](architecture/PHASE_1_4_DATABASE.md),
[Stage 1 verification](testing/PHASE_1_4_STAGE_1_VERIFICATION.md), and
[UI/UX refinement report](architecture/PHASE_1_4_UI_UX_REFINEMENT.md) for
scope-specific evidence and limitations. The reports describe different
stages: the database/API foundation changed contracts; the later A2–A5 UI
refinement stayed within those existing contracts.

## Approved architectural decisions

| Topic              | Established decision                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Task details       | Dedicated full-page route.                                                                          |
| Task editing       | Separate edit route.                                                                                |
| Task pagination    | Cursor-based; retain opaque cursors.                                                                |
| Router             | Keep declarative `BrowserRouter`; do not convert solely for `useBlocker`.                           |
| Academic hierarchy | Academic Year → Period → Subject.                                                                   |
| Registration       | No mandatory institution/program selection.                                                         |
| Deadlines          | Preserve local date/time/timezone and resolved instant; all-day deadlines stay date-only.           |
| Concurrency        | Optimistic concurrency; stale operations require review and must not silently overwrite.            |
| Calendar           | Separate implementation scope; not part of the accepted Phase 1.4 UI refinement.                    |
| Dashboard          | Preserve existing functionality. The original Phase 1.4 Batch 2 Dashboard expansion remains paused. |

## Known limitations and security/data integrity

- Browser Back/Forward can leave a dirty task edit without the custom
  confirmation. This limitation was explicitly accepted; seek approval before
  changing router architecture.
- The task-list API supports one `subject_id` filter, not whole-year or
  whole-period filtering. Those filters require a separately approved API
  enhancement.
- The production JavaScript chunk warning and ESLint module-type warning are
  known and non-blocking; consider performance follow-up separately.
- The original Phase 1.4 Batch 2 Dashboard and Calendar work remains paused.
- Supabase Auth and RLS, verified user ownership, server-side authorization,
  shared input/response schemas, and protected archive/permanent-delete
  operations are required boundaries. Do not bypass them to work around
  implementation problems.
- Do not silently change confirmed deadlines or overwrite newer task data.
  Preserve explicit deadline review and optimistic version checks.
- Do not expose environment secrets or weaken security/validation.
- The authentication ADR documents a limitation: the Google-only password
  reset restriction is enforced by the SyllabusSync UI, not by a server-side
  Supabase Auth policy. Do not describe it as a hard server-side invariant.

## Roadmap

- Phase 0: Product discovery and validation.
- Phase 1: Application foundation — Phases 1.1, 1.2, 1.3, and 1.4 are complete
  and accepted.
- Phase 2: AI and document understanding — in progress. PDF/OCR processing
  and candidate review infrastructure are present; production requirement
  extraction and representative AI evaluation remain blocked on provider and
  privacy decisions. Phase 2.6 announcement support remains excluded.
- Phase 3: Workload intelligence.
- Phase 4: Advanced AI features.
- Phase 5: Pilot testing and commercialization.

## Current repository snapshot

At the time of inspection, the repository path was
`C:\Users\nyxai\Projects\syllabussync`, branch `main`, at commit
`8cdcd4b`. The working tree was **not clean**: before adding this context and
the repository instructions, Git reported 12 modified tracked files and 26
untracked files. The dirty tree contains work from multiple completed efforts
and environment diagnostics. Git status alone does not establish which
milestone owns each file; inspect the diff and confirm ownership before
staging. Do not reset, clean, stash, restore, or overwrite user changes.

The root `README.md` still summarizes only Phases 1.1–1.3, while the current
working tree contains Phase 1.4 routes, database documentation, migrations,
and tests. This is a documentation lag, not evidence that the Phase 1.4 work
is absent. The detailed Phase 1.4 documents describe the stage-specific scope.

## Existing documentation

- [README](../README.md) — quick start and original workspace overview.
- [Contributing](../CONTRIBUTING.md) — incremental changes and verification.
- [Architecture](architecture/ARCHITECTURE.md) — application boundaries.
- [Technical decisions](decisions/TECHNICAL_DECISIONS.md) — foundational stack decisions.
- [Authentication ADR](decisions/ADR-AUTHENTICATION.md) and
  [Phase 1.2 architecture](architecture/PHASE_1_2_AUTHENTICATION.md).
- [Phase 1.3 workspace architecture](architecture/PHASE_1_3_ACADEMIC_WORKSPACE.md).
- [Phase 1.4 database](architecture/PHASE_1_4_DATABASE.md) and
  [UI/UX refinement](architecture/PHASE_1_4_UI_UX_REFINEMENT.md).
- `docs/testing/PHASE_1_*_VERIFICATION.md` — milestone verification evidence.
- [Local setup](development/LOCAL_SETUP.md) — local development and Supabase
  setup. It includes environment-specific guidance; do not copy local IPs or
  credentials into application code.

## Development workflow for Codex

Codex is the primary implementation developer. For each authorized milestone:

1. Read this document and the relevant detailed docs/instructions.
2. Clarify the requirement and inspect only relevant implementation and
   dependencies; do not repeat broad audits without need.
3. Make reasonable decisions within approved scope; ask only for genuine
   product, architectural, security, database, or API contract decisions.
4. Implement sequentially, preserve existing behavior and user changes, and
   add focused tests without duplicating accepted characterization coverage.
5. Run focused tests, relevant regression tests, and appropriate typecheck,
   lint, and build checks. Report only commands that actually ran and their
   results, including environmental failures.
6. Document important decisions and provide one consolidated completion
   report.

Never commit or push without explicit authorization. Do not touch hosted
Supabase unless explicitly authorized.

### Common commands

```sh
pnpm install
pnpm dev
pnpm --filter @syllabussync/web test
pnpm --filter @syllabussync/api test
pnpm --filter @syllabussync/shared test
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

For database tests, use `supabase test db` only against the isolated local
Supabase project, following the relevant verification document. Never infer
that a database test ran from a successful application test command.
