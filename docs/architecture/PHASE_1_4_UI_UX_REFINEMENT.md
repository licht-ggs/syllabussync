# Phase 1.4 UI/UX refinement — Stages A2–A5

## Scope delivered

- Added a protected application shell with responsive Workspace, Tasks, and Archives navigation and an account menu for sign-out.
- Kept the existing declarative `BrowserRouter`, authentication guards, session handling, and route access rules.
- Moved the existing archive management view to `/archives`; it continues to use the existing archive/restore and reviewed permanent-deletion flows.
- Made academic year, period, and subject forms collapsible. Their controlled inputs remain mounted while a disclosure is closed, preserving an in-progress draft.
- Added full-page task details at `/tasks/:taskId` and separate editing at `/tasks/:taskId/edit`, both backed by the existing authenticated `GET /api/tasks/:taskId` endpoint.
- Synchronized supported task filters and cursor position with query parameters. Cursor pagination still uses the API’s opaque cursor; navigating to a cursor URL fetches the page after that cursor.
- Grouped subject choices by academic year and period while sending the existing `subject_id` filter.
- Preserved dirty-form navigation confirmation, before-unload protection, deadline confirmation, task history, and optimistic version checks. A stale edit keeps its draft open and shows the latest server version for review.

## Contract boundaries

No database schema, migration, RPC, RLS policy, or API contract was changed. No Calendar route or functionality was added, and the paused Dashboard scope was not expanded.

The current task-list API accepts a single `subject_id`; it does not accept an academic-year or period filter. The picker therefore provides year/period context for subject filtering, but filtering all tasks for an entire period or year would require an API contract change and remains outside this approval.

## Verification

- Focused shell, workspace/archive, and task suites: **30 tests passed** before final cleanup.
- Final web suite: **8 files, 59 tests passed**.
- Repository typecheck: **passed**.
- Repository lint: **passed**. ESLint emitted the existing `MODULE_TYPELESS_PACKAGE_JSON` warning for `eslint.config.js`.
- Repository build: **passed**. Vite emitted dependency annotation notices and the existing large-chunk warning (about 949 kB uncompressed).
- Prettier check on the new verification note: **passed**.
- `git diff --check`: **passed**, with existing CRLF normalization warnings in unrelated Supabase files.
- The one full repository test run reported **32/33 API tests passing**; `apps/api/src/middleware/error-handler.test.ts` exceeded its 5-second test timeout (reported duration about 8 seconds) while the API and web suites ran concurrently. The API suite was not retried. The complete web suite was then run separately and passed.
- No database tests were run because these UI changes do not change database behavior.

## Acceptance note

The UI implementation is complete within the approved client/API boundaries. The API test timeout remains an unverified regression-suite item; it is not reported as a passing test.
