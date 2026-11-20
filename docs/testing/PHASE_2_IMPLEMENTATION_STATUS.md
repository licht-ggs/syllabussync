# Phase 2 Implementation Status

**Authorization:** Phases 2.1–2.5, dated 2026-11-20

**Phase 2.6:** Excluded

**Verification environment:** Windows local development checkout plus the
task-created isolated local Supabase database. No hosted Supabase project was
accessed. No commit or push was made.

## Milestone status

### Phase 2.1 — Document management

Implemented authenticated PDF upload, private storage, document listing,
owner-scoped retrieval and deletion, checksum duplicate detection, and upload
retry. The configured limits are 20 MiB and 200 pages. The migration and
Storage policies were verified in the isolated local Supabase database with
14/14 pgTAP assertions. Storage object deletion is performed through the
Storage API; the SQL test verifies the owner policy and the API test verifies
the deletion sequence.

### Phase 2.2 — PDF processing and OCR

Implemented a separately runnable API worker, persistent queue and page
records, idempotent retries, progress, native PDF.js text extraction, and
fallback OCR using Tesseract.js with a locally bundled English model and
`@napi-rs/canvas` for page rendering. The source PDF is retained until the
student deletes the document. Worker and processing SQL tests passed. OCR
testing currently uses generated synthetic English content; it is not a
representative accuracy or load benchmark.

The processing migration passed 19/19 pgTAP assertions in the isolated local
database. The existing Supabase CLI loopback test runner remains unusable in
this environment; SQL tests were run directly inside the isolated PostgreSQL
container using `psql`. The temporary database's Supabase migration ledger
still lists the six migrations applied during the earlier isolated setup;
the candidate migrations were applied directly for SQL verification and were
not recorded in that ledger.

### Phase 2.3 — Requirement extraction

Implemented strict shared candidate schemas, evidence/page validation,
deadline certainty validation, and a provider-independent extraction
interface. Synthetic-provider tests confirm malformed data, uncertain
normalized dates, wrong page numbers, and unsupported evidence are rejected.
Candidate records and owner-scoped storage are present in migrations.

**Not complete:** No production provider adapter, extraction job/worker,
provider configuration, disclosure version, consent capture/revocation, or
provider-backed extraction is enabled. The Phase 2.0 specification leaves
provider retention, processing region, subprocessors, cost, and quality
evaluation open. Choosing a provider or accepting its terms would commit
student documents to an external processor, so this work remains disabled.
No real student document was sent to any provider.

### Phase 2.4 — Review and approval

Implemented an authenticated review screen, evidence excerpt and cited-page
PDF access, candidate editing, rejection, and an approval operation that calls
the existing `create_task` database function and records the source-task
relationship in the same transaction. Approval requires a saved exact date
and subject; timed deadlines use the existing local timezone/DST resolver.
Retries cannot create a second task. Deleting the source removes its
candidate, while the created task remains. The isolated candidate pgTAP suite
passed 14/14 assertions, including owner isolation, database-controlled
review timestamps, approval, duplicate prevention, and source deletion
behavior.

Review and approval work for persisted candidates. Candidate generation is
not available until the Phase 2.3 provider gate is resolved.

### Phase 2.5 — Evaluation and hardening

Security, shared validation, PDF size/page boundaries, worker failure paths,
OCR smoke behavior, candidate evidence validation, database ownership,
atomic task creation, and regression suites have automated coverage.

**Not complete:** The required representative synthetic/permissioned syllabus
corpus and measured extraction precision/recall, classification accuracy,
deadline interpretation accuracy, and evidence correctness do not exist yet.
The current OCR fixtures prove a narrow synthetic text-recognition path only;
they do not establish representative OCR accuracy. Those measurements depend
on having a configured extraction provider and a reviewed corpus. No
production-readiness or AI quality claim is made.

## Verification actually run

- Shared schemas: **26/26 tests passed**, 6 test files.
- API: **54/54 tests passed**, 10 test files; the final suite was run
  independently of the web suite (19.33 seconds). The error-handler test
  passed in 0.41 seconds in that run.
- Web: **64/64 tests passed**, 10 test files.
- Repository typecheck: **passed** for shared, API, and web packages.
- Repository lint: **passed**. ESLint emitted the existing
  `MODULE_TYPELESS_PACKAGE_JSON` warning for `eslint.config.js`.
- Production build: **passed**. Vite emitted the existing Zod annotation
  notices and a chunk-size warning; the main JavaScript bundle is 996.05 kB
  minified (264.16 kB gzip) on the first build, and 996.45 kB minified
  (264.34 kB gzip) after the final navigation guard update.
- Prettier check for all touched TypeScript and Phase 2 documentation files:
  **passed**.
- Isolated local pgTAP: Phase 2.1 **14/14**, Phase 2.2 **19/19**, candidate
  persistence/approval **14/14**.
- Synthetic extraction-boundary tests: **4/4 passed**.
- Focused document UI tests: **4/4 passed**.

These results do not include live provider tests, a complete candidate
generation workflow, browser/device usability evaluation, penetration testing,
or deployment verification. `git diff --check` is reported after the final
working-tree review.

## Migrations

- `20261120140000_add_document_processing.sql`
- `20261120160000_add_requirement_candidates.sql`
- `20261120170000_require_exact_candidate_dates.sql`

Only the isolated local Supabase database was used for direct SQL verification.
The shared task API contract and original `create_task` function were not
changed; the new approval function delegates task creation to that existing
function. No hosted schema, secrets, or production data were touched.

## Remaining steps before Phase 2 acceptance or deployment

1. Select/evaluate a provider against retention, training, processing region,
   subprocessors, contractual protections, cost, and structured-output
   behavior; document the decision.
2. Implement and test provider-specific disclosure, versioned consent and
   revocation, async extraction jobs, validated candidate persistence, and
   provider failure/retry behavior. Keep real documents disabled until those
   safeguards are verified.
3. Assemble a reviewed, representative synthetic/permissioned corpus and
   report measured PDF/OCR/extraction metrics without inventing thresholds.
4. Complete security, usability, and deployment-environment verification.
5. Run final formatting/diff checks and verify all migration files through a
   clean isolated Supabase migration workflow when the local CLI loopback
   issue is resolved or a safe isolated alternative is available.
