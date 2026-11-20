# Phase 2 — AI Pipeline Architecture Proposal

> **Superseded draft:** Use [Phase 2.0 Requirements and Architecture](PHASE_2_REQUIREMENTS_AND_ARCHITECTURE.md)
> as the current consolidated draft. This earlier proposal is retained as
> project history and is not the source of current Phase 2 decisions.

**Status:** Proposed architecture for review; not approved for implementation.
Related product requirements: [Phase 2 requirements proposal](../product/PHASE_2_REQUIREMENTS_PROPOSAL.md).

## Current constraints

The current repository has a React/Vite client, an authenticated Express API,
shared Zod schemas, and Supabase PostgreSQL/Auth. The API verifies Supabase
bearer tokens and uses the caller's token for RLS-scoped database work. The
architecture places long-running Python/OCR/AI work in separate asynchronous
services rather than in request handlers. There is no approved document
storage system, job queue, extraction worker, or LLM/OCR provider in the
current architecture.

## Recommended logical flow

```text
Authenticated web client
        │ request upload/job
        ▼
Express API ───► private document storage
        │                 │
        │ create job      │ private object reference
        ▼                 ▼
PostgreSQL job state ◄── asynchronous worker
                            │
                  text extraction / OCR
                            │
                 structured model proposal
                            │
                 schema and evidence checks
                            ▼
                 candidate requirements
                            │
                            ▼
             student review and approval UI
                            │ explicit approval
                            ▼
                existing task creation path
```

This is a logical separation, not a commitment to a queue, storage product,
vendor, or deployment topology. Select those only after the data-handling
decisions in the requirements proposal are approved.

## Component responsibilities

### Web client

- Authenticate through the existing Supabase Auth session.
- Ask the API to initiate an upload or processing job; do not call an LLM/OCR
  provider directly.
- Show the job state and allow the owner to review candidates alongside
  source evidence.
- Require explicit per-item approval before requesting task creation.
- Do not treat browser validation or route guards as security controls.

### Express API

- Verify the caller's bearer token and derive ownership from the verified
  Supabase user.
- Validate all request and response shapes with shared Zod schemas.
- Authorize every document, job, and candidate read or mutation by owner.
- Keep upload/job endpoints short-running. Do not run OCR or model inference
  inside the HTTP request lifecycle.
- Submit an approved candidate through the existing task creation contract;
  do not add source fields to task requests without explicit contract review.

### Private storage

- Store documents privately and bind each object to the authenticated owner.
- Use short-lived authorized upload/download access if direct browser transfer
  is selected; never make originals public.
- Validate actual file content, not only the filename or browser-provided MIME
  type. Enforce approved size/page limits and reject unsupported or malformed
  files.
- Define deletion and retention behavior before implementation. Do not log
  document contents, credentials, or signed URLs.

### Job state and asynchronous worker

- Persist explicit states such as `queued`, `processing`, `review_required`,
  `completed`, and `failed`, plus safe error categories and retry metadata.
- Make job submission and worker retries idempotent so retries do not create
  duplicate candidate sets or tasks.
- Keep CPU-heavy PDF/OCR work and external model calls outside the API process.
- Run with least privilege. A worker must not receive a broad database or
  storage credential if narrower access is feasible; document any required
  privileged boundary and threat model before choosing deployment.
- Treat uploaded documents as untrusted input. Do not execute embedded
  content, follow arbitrary external links, or let document instructions
  override the extraction task or system policy.

### Extraction and evidence validation

- Extract text with page boundaries preserved; apply OCR only to pages without
  usable text if that path is approved.
- Ask the model for schema-constrained candidate data, but treat model output
  as untrusted and validate it again server-side.
- Store evidence references per candidate and field, including source page
  and exact supporting text. Coordinates may be added if required for a
  reliable visual highlight, subject to review of storage and privacy needs.
- Require evidence for task titles and deadline claims. An unsupported value
  must be absent or marked uncertain, never filled by model guesswork.
- Normalize dates without losing their original wording. Relative, ambiguous,
  conflicting, or incomplete deadlines require student clarification.
- Keep extraction separate from task persistence. Candidates remain
  unconfirmed data until the student approves them.

## Security and privacy boundaries

- Continue using Supabase Auth, server-side token verification, owner-scoped
  authorization, RLS, and shared schema validation.
- Do not put service-role keys, model credentials, or private storage
  credentials into Vite-exposed environment variables.
- Before provider selection, review retention, training use, data location,
  subprocessors, access logging, and deletion guarantees for student material.
- Minimize copies of raw documents and extracted text. Define retention,
  deletion, backup, and support access rules before building the pipeline.
- Restrict logs and telemetry to operational metadata; never emit document
  contents or extracted personal data by default.
- Maintain an auditable relationship between source, job, candidate, review
  decision, and any created task if product requirements approve retaining
  that relationship.

## Data and API boundary implications

The proposed flow likely requires document/job/candidate persistence and
upload/job/review endpoints. That implies new database objects, RLS policies,
and API contracts. None are defined or authorized here. Before implementation,
review entity ownership, state transitions, retention/deletion cascade,
idempotency, evidence representation, and whether accepted task citations
persist. Obtain explicit approval for the resulting database and API
contracts before editing migrations or endpoint schemas.

## Failure handling

- A processing failure leaves the source and job state visible to its owner
  until the approved retention policy says otherwise.
- Retries are bounded and observable. A terminal failure offers a safe retry
  or manual task entry path.
- OCR and model unavailability do not block ordinary task creation or the
  rest of SyllabusSync.
- Invalid model output, absent evidence, conflicting sources, and uncertain
  dates return candidates for review or abstain; they never become tasks
  automatically.

## Decisions intentionally left open

This proposal does not select a storage service, queue, OCR engine, model
provider, hosting region, file limit, retention duration, evidence schema, or
numerical quality threshold. Resolve these with the product/security decisions
and pilot evidence listed in the requirements proposal. Do not introduce a
Python service or vendor dependency until the selected design has an approved
operational boundary and deployment plan.

## First-party documentation review and recommendation

Current first-party documentation narrows, but does not eliminate, the privacy
decisions:

- Supabase documents private Storage buckets as RLS-controlled and suitable
  for sensitive user documents. It also documents that signed URLs remain
  usable until expiry; deleting or moving the object is needed to invalidate
  an individual URL. See [private bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals),
  [download access](https://supabase.com/docs/guides/storage/serving/downloads),
  and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- OpenAI states that API inputs/outputs are not used for model training by
  default, but abuse-monitoring logs are normally retained for up to 30 days.
  Zero Data Retention is available only to eligible customers and supported
  endpoints. Therefore, “not used for training” alone is not sufficient for
  SyllabusSync's data-retention decision. See [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data).

Recommended direction, subject to owner review: if Storage is selected, use a
private bucket with owner-scoped policies and authenticated access; avoid
long-lived signed URLs for student originals. Treat OpenAI API as a possible
extraction provider only after verifying account eligibility, endpoint-level
retention, region, contractual terms, and an explicit student disclosure. Use
synthetic or permissioned/de-identified documents for evaluation until those
checks are complete. This recommendation does not enable Storage, create
policies, select a provider, or authorize transmission of real student
documents.
