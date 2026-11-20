# SyllabusSync

# Phase 2.0 — Requirements and Architecture Specification

**Project:** SyllabusSync

**Phase:** 2.0 — AI and Document Understanding

**Document Type:** Product Requirements and Technical Architecture

**Status:** Approved for Phases 2.1–2.5 implementation by project instruction dated 2026-11-20

**Implementation Status:** Phases 2.1–2.2 implemented; Phases 2.3–2.5 partially implemented with provider-dependent work deferred; Phase 2.6 excluded

**Preceding Phase:** Phase 1.4 — Tasks, Deadlines, and accepted UI/UX refinement

---

## 1. Executive Summary

> **Repository scope note:** Phase 1.4's original Dashboard expansion and
> Calendar implementation remain paused/out of scope. This specification
> does not authorize or imply their completion.

Phase 2 introduces SyllabusSync's document-understanding capabilities.

The initial objective is to allow students to upload academic syllabi in PDF format, extract academic requirements using document processing and AI, review the extracted information against its original source, and explicitly approve requirements before they become actual tasks.

The system must prioritize accuracy, transparency, student control, privacy, and data integrity.

AI-generated information must never be treated as authoritative without student review.

### 1.1 Initial MVP

The first complete workflow is:

1. Student uploads a syllabus PDF.
2. SyllabusSync securely stores the original document.
3. A background processing pipeline extracts its text.
4. OCR is used when pages contain scanned content.
5. AI identifies potential academic requirements.
6. Each extracted requirement includes supporting document evidence.
7. Student reviews, edits, approves, or rejects each requirement.
8. Approved requirements are converted into tasks using the existing task-management system.

### 1.2 Confirmed Product Decisions

| Decision                    | Approved Direction                                |
| --------------------------- | ------------------------------------------------- |
| Initial document format     | PDF only                                          |
| Original document retention | Until explicitly deleted by the student           |
| Third-party AI processing   | Allowed with clear disclosure and student consent |
| Initial document scope      | Syllabus first                                    |
| Announcement processing     | Deferred                                          |
| Student approval            | Required before task creation                     |
| Implementation              | Not yet authorized                                |

---

## 2. Product Objectives

Phase 2.0 establishes the foundation for the following capabilities:

- Understand academic syllabus documents.
- Identify assignments, examinations, projects, activities, and other academic requirements.
- Extract potential deadlines and relevant dates.
- Preserve evidence linking extracted information to its original document.
- Reduce manual academic task entry.
- Allow students to verify AI-generated information.
- Integrate approved requirements with the existing task-management system.

### 2.1 Success Criteria

The MVP must demonstrate that a student can upload a syllabus, receive useful and evidence-supported requirement candidates, review them, and approve selected candidates into their task list.

The workflow must remain reliable even when documents contain:

- Scanned pages.
- Tables.
- Multiple subjects or grading periods.
- Ambiguous dates.
- Missing deadlines.
- Repeated requirements.
- Unreadable or incorrectly formatted pages.

---

## 3. Scope

### 3.1 Included in Initial MVP

**Document management**

- PDF upload.
- Private document storage.
- Document listing and details.
- Processing status.
- Document deletion.
- Document ownership and access enforcement.

**Document processing**

- PDF validation.
- Digital text extraction.
- Page-level text preservation.
- OCR fallback for scanned pages.
- Processing error handling.

**AI extraction**

- Academic requirement identification.
- Requirement classification.
- Description extraction.
- Deadline interpretation.
- Supporting evidence generation.
- Uncertain or missing information handling.
- Structured output validation.

**Student review**

- Extraction results display.
- Original page references.
- Supporting evidence display.
- Requirement editing.
- Individual approval and rejection.
- Duplicate detection and review.
- Explicit task creation.

**System reliability**

- Asynchronous processing.
- Processing status tracking.
- Failure recovery.
- Duplicate prevention.
- Auditability.
- Privacy and security controls.

### 3.2 Explicitly Excluded

The following are not part of the initial MVP:

- Announcement ingestion.
- Email integration.
- Learning Management System integrations.
- Automatic deadline changes.
- Automatic task creation without approval.
- Automatic synchronization with external calendars.
- AI-generated study schedules.
- Workload forecasting.
- Chat with academic documents.
- Multi-document cross-referencing.
- Institution-wide document sharing.
- Instructor dashboards.
- Automatic detection of changes across different syllabus versions.

These may be considered in later phases.

---

## 4. Functional Requirements

### FR-01: PDF Upload

Students must be able to upload PDF syllabi.

Requirements:

- Only authenticated users may upload documents.
- Uploads must be associated with the authenticated owner.
- Validate actual file content, not only the extension or MIME type.
- Reject malformed, encrypted, unsupported, or invalid documents with understandable errors.
- Enforce configurable file-size and page-count limits.
- Prevent unsafe filenames and path traversal.
- Generate a unique internal document identifier.
- Store documents privately.

Initial limits must be established through technical testing before implementation.

### FR-02: Document Management

Students must be able to:

- View their uploaded documents.
- View document metadata and processing status.
- Open their original documents through authorized access.
- Delete documents.
- View processing errors and retry eligible failed operations.

Documents must not be accessible through public storage URLs.

### FR-03: Document Text Extraction

The processing pipeline must distinguish between:

1. Digitally generated PDFs containing extractable text.
2. Scanned PDFs requiring OCR.

The system must:

- Extract text by page.
- Preserve page numbers.
- Retain extraction provenance.
- Identify pages with insufficient or unreadable text.
- Record processing failures.
- Avoid presenting OCR output as perfectly accurate.

OCR should be a fallback when native text extraction is insufficient.

### FR-04: AI Academic Requirement Extraction

The AI pipeline must identify potential academic requirements, including:

- Assignments.
- Projects.
- Examinations.
- Quizzes.
- Presentations.
- Laboratory activities.
- Reports.
- Other explicitly identifiable academic deliverables.

Each candidate should contain:

- Requirement title.
- Description.
- Requirement type.
- Associated subject, where identifiable.
- Original date expression.
- Normalized date, when confidently interpretable.
- Deadline certainty.
- Source page reference.
- Supporting evidence.
- Extraction confidence.
- Processing provenance.

Unknown or ambiguous information must remain unknown or ambiguous.

The AI must never invent missing deadlines, subjects, dates, or academic instructions.

### FR-05: Evidence and Provenance

Every extracted requirement must be traceable to its source.

Evidence should contain:

- Document identifier.
- Original page number.
- Supporting text excerpt.
- Evidence location or bounding information when available.
- Extraction method, such as native PDF text or OCR.

The system must distinguish between:

- Directly stated requirements.
- AI-inferred interpretations.
- Uncertain information.

A confidence score is not proof of correctness.

The original document remains the authoritative source.

### FR-06: Student Review

Students must be able to:

- Review each candidate independently.
- Open the relevant original document page.
- Inspect the supporting evidence.
- Edit titles and descriptions.
- Correct or supply dates.
- Leave deadlines unspecified.
- Reject irrelevant candidates.
- Approve individual candidates.
- Approve multiple candidates after reviewing them.

The system must clearly distinguish extracted candidates from approved tasks.

### FR-07: Task Creation

Only explicitly approved requirements may create tasks.

Task creation must:

- Use the existing task-management system.
- Preserve existing ownership and authorization rules.
- Respect existing task validation schemas.
- Respect existing subject relationships.
- Use existing deadline and timezone handling.
- Prevent duplicate creation when a request is retried.
- Record the relationship between the created task and its source document.

Task creation must be atomic or safely recoverable.

The AI pipeline must not directly bypass existing task authorization or data-integrity protections.

### FR-08: Deadline Handling

The system must distinguish:

- Exact dates.
- Relative dates.
- Recurring requirements.
- Date ranges.
- Ambiguous dates.
- Dates without a year.
- Requirements with no specified deadline.

The system must not silently resolve ambiguous dates using arbitrary assumptions.

Where a year or timezone is necessary, the student must be able to review and confirm the interpretation.

Existing Phase 1.4 deadline semantics must remain intact:

- Date-only deadlines remain date-only.
- Timed deadlines retain local date, local time, IANA timezone, and resolved instant.
- Existing DST protections remain enforced.

### FR-09: Document Deletion

The student owns their uploaded documents and controls their retention.

When a student deletes a document:

- The original file must be removed.
- Associated extracted text and evidence must be deleted.
- Pending processing must be cancelled or prevented from publishing results.
- Derived, unapproved candidates must be removed.
- Processing artifacts must be deleted according to the deletion workflow.
- Deletion failures must be observable and safely retryable.

Approved tasks require special handling.

Deleting a source document must not silently delete approved tasks or alter their deadlines. Approved tasks should remain intact unless the student separately chooses to delete them.

The system must preserve the necessary distinction between deleting source material and deleting existing academic records.

---

## 5. Non-Functional Requirements

### NFR-01: Security

- Authentication is required for all document operations.
- Every document operation must enforce ownership.
- Storage must be private.
- Signed URLs must be short-lived and authorization-controlled.
- Database access must respect RLS.
- Server-side authorization must not rely on frontend restrictions.
- API inputs and AI outputs must be validated.
- File uploads must be protected against malicious content and resource exhaustion.
- Secrets must remain server-side.
- Logs must not contain document contents, access tokens, or unnecessary personal information.

### NFR-02: Privacy

Students must receive clear information about:

- What information is processed.
- Why it is processed.
- Which external providers receive data.
- How long information is retained.
- How deletion works.
- What happens when AI processing fails.

Third-party processing requires explicit, informed consent before document content is transmitted.

Consent must be recorded with enough information to establish what the student agreed to, including the applicable disclosure version.

### NFR-03: Reliability

- Processing must not depend on a browser session remaining open.
- Failed jobs must be recoverable.
- Retried jobs must not create duplicate tasks.
- Processing states must be persistent.
- Interrupted jobs must be identifiable.
- Students must receive understandable failure messages.

### NFR-04: Performance

Document processing should be asynchronous.

Uploads and document listing must not wait for OCR or AI processing to complete.

Specific file-size, page-count, concurrency, and processing-time targets will be established during technical validation.

### NFR-05: Maintainability

- Keep document management separate from AI extraction.
- Keep AI providers behind an abstraction boundary.
- Validate all external AI output.
- Maintain typed shared schemas where appropriate.
- Preserve existing application architecture.
- Avoid introducing unnecessary services or infrastructure.

---

## 6. Proposed Technical Architecture

### 6.1 Architectural Overview

The proposed workflow is:

Student
→ React Web Application
→ Express API
→ Private Document Storage
→ Processing Job Queue
→ Document Processing Worker
→ PDF Text Extraction / OCR
→ AI Extraction Provider
→ Structured Validation
→ Requirement Candidates
→ Student Review
→ Existing Task Management API

### 6.2 Frontend

The existing React and TypeScript application will provide:

- Document upload interface.
- Document library.
- Processing status.
- Extraction review interface.
- Evidence viewer.
- Approval and rejection controls.

The UI must be responsive and consistent with the existing application.

The document review interface should not be treated as an ordinary task form. It must clearly communicate that candidates are AI-generated and awaiting student confirmation.

### 6.3 Backend

The existing Express API remains the application entry point.

Proposed responsibilities:

**Document module**

- Upload validation.
- Document metadata.
- Ownership enforcement.
- Authorized document retrieval.
- Deletion.

**Processing module**

- Job creation.
- Job status.
- Retry handling.
- Processing coordination.

**Extraction module**

- PDF parsing.
- OCR coordination.
- AI provider integration.
- Structured output validation.

**Review module**

- Candidate retrieval.
- Candidate edits.
- Approval and rejection.
- Task creation coordination.

These are logical boundaries. They do not require separate microservices.

### 6.4 Processing Worker

Document processing must run outside normal synchronous HTTP request handling.

A background worker should:

1. Claim an eligible processing job.
2. Verify document ownership and availability.
3. Retrieve the private source file.
4. Extract native PDF text.
5. Determine whether OCR is required.
6. Generate structured extraction input.
7. Call the configured AI provider if consent is valid.
8. Validate the AI response.
9. Persist candidates and evidence.
10. Update processing status.

The worker must support safe retries and idempotent execution.

The initial deployment approach should favor the simplest maintainable worker architecture compatible with the current infrastructure.

A separate microservice should not be introduced without demonstrated need.

### 6.5 Storage

Use private Supabase Storage as the proposed initial document-storage solution, subject to verification of current project configuration and storage capabilities.

The application database stores document metadata and processing records.

The original PDF must never be stored in a publicly accessible bucket.

### 6.6 AI Provider Abstraction

The system must not couple core application logic to a single AI provider.

Introduce a provider boundary that supports:

- Structured extraction requests.
- Validated structured responses.
- Provider error handling.
- Timeouts and retry policies.
- Model and prompt version tracking.
- Provider configuration.

Provider selection remains an implementation decision pending privacy, retention, regional processing, cost, and quality evaluation.

### 6.7 Python and OCR

Python is part of the established long-term technology direction.

However, introducing a separate Python processing service must be justified by actual OCR and PDF-processing requirements.

During architecture validation, compare:

- Node-compatible PDF/OCR libraries.
- A Python worker using appropriate PDF and OCR libraries.
- Operational complexity and deployment costs.

Select the simplest approach that satisfies reliability, accuracy, and maintainability requirements.

---

## 7. Proposed Data Model

The following are conceptual entities, not approved database migrations.

### 7.1 Academic Documents

Represents uploaded source documents.

Potential fields:

- id
- owner_id
- filename
- storage_path
- mime_type
- file_size
- checksum
- page_count
- document_type
- processing_status
- created_at
- updated_at
- deleted_at, if soft deletion is technically required

### 7.2 Document Processing Jobs

Tracks asynchronous processing.

Potential fields:

- id
- document_id
- owner_id
- status
- attempt_count
- worker metadata
- processing version
- error category
- created_at
- started_at
- completed_at

### 7.3 Document Pages / Extracted Content

Represents page-level extraction.

Potential fields:

- id
- document_id
- page_number
- extracted_text
- extraction_method
- extraction_status
- metadata

Storage of large extracted text must be evaluated for appropriate database usage and privacy implications.

### 7.4 Requirement Candidates

Represents AI-extracted requirements awaiting student review.

Potential fields:

- id
- document_id
- owner_id
- title
- description
- requirement_type
- original_date_expression
- normalized_due_date
- normalized_due_time
- deadline_status
- confidence
- review_status
- extraction_version
- created_at
- updated_at

### 7.5 Requirement Evidence

Represents traceability to the original source.

Potential fields:

- id
- candidate_id
- document_id
- page_number
- supporting_excerpt
- location_metadata
- extraction_method

### 7.6 Approval and Task Relationship

Approved requirements must have a durable relationship with the tasks they create.

Potential fields:

- candidate_id
- task_id
- approved_by
- approved_at

The relationship must prevent the same candidate from creating duplicate tasks through retries.

### 7.7 Consent Records

Record:

- owner_id
- consent purpose
- disclosure version
- provider or processing category
- consent status
- timestamp

Consent must be revocable for future processing. The implications of revocation for previously processed information must be clearly disclosed.

---

## 8. Processing State Model

### Document states

- uploaded
- queued
- processing
- review_ready
- failed
- deletion_pending
- deleted

### Candidate review states

- pending_review
- edited
- approved
- rejected
- creation_failed

These are proposed states. The final state machine must define legal transitions and concurrency behavior.

A document can be successfully processed even when some requirements remain uncertain or incomplete.

A processing failure must not create partial approved tasks.

---

## 9. AI Output Contract

The AI must return structured data, not unrestricted prose.

Each requirement candidate must include:

- title
- description
- requirement_type
- source_page
- supporting_evidence
- original_date_expression
- normalized_date, if determinable
- normalized_time, if explicitly stated
- deadline_certainty
- confidence
- uncertainty_notes

Validation must reject:

- Invalid page references.
- Unsupported evidence references.
- Invalid dates.
- Unexpected fields where strict schemas are required.
- Malformed or incomplete structures.

The application must independently verify that evidence references correspond to the processed document.

AI confidence must not replace student review.

---

## 10. Duplicate Detection and Document Reprocessing

The system should detect duplicate uploads using a content checksum, scoped to the authenticated owner.

Duplicate upload handling must be explicit.

It must not silently overwrite an existing document or merge candidates.

Reprocessing the same document must not create duplicate approved tasks.

Document versioning and comparison between different syllabus versions are deferred beyond the initial MVP.

---

## 11. Evaluation and Quality Assurance

Before production use, establish a reviewed evaluation dataset consisting of synthetic, permissioned, or appropriately de-identified syllabi.

The dataset should include:

- Digital PDFs.
- Scanned PDFs.
- Different document layouts.
- Tables.
- Ambiguous dates.
- Repeated requirements.
- Requirements without deadlines.
- Multi-page requirements.

Evaluate:

1. Requirement extraction precision.
2. Requirement extraction recall.
3. Requirement classification accuracy.
4. Deadline interpretation accuracy.
5. Evidence correctness.
6. Page-reference correctness.
7. Duplicate detection.
8. OCR quality.
9. Processing reliability.
10. Safe failure behavior.

Numerical acceptance thresholds must be established after a representative baseline evaluation.

A successful API response alone does not establish extraction quality.

---

## 12. Privacy and External AI Processing

Third-party AI processing is permitted only with clear disclosure and student consent.

Before selecting a provider, evaluate:

- Whether submitted content is used for model training.
- Data retention and deletion policies.
- Processing regions.
- Subprocessors.
- Encryption.
- Contractual protections.
- Available data-processing agreements.
- Cost and rate limits.
- Structured-output reliability.

Initial development and evaluation should use synthetic or permissioned documents.

Real student documents must not be sent to an external provider until the provider has been evaluated and the required consent and privacy safeguards are implemented.

---

## 13. Integration with Existing Phase 1.4

Phase 2 must extend the existing application instead of replacing established functionality.

Important compatibility requirements:

- Reuse the existing authenticated user model.
- Reuse existing task ownership rules.
- Reuse shared validation conventions.
- Reuse existing task creation behavior.
- Preserve optimistic concurrency.
- Preserve date-only and timed deadline semantics.
- Preserve IANA timezone handling.
- Preserve task history and existing protections.
- Preserve the academic year → period → subject hierarchy.

The AI pipeline must not bypass the existing task API or protected database operations.

If an approved requirement has no confirmed subject, the student must be able to select one before task creation when the existing task contract requires it.

---

## 14. Proposed Implementation Milestones

### Phase 2.0 — Requirements and Architecture

Current milestone.

Deliverables:

- Approved requirements.
- Approved architecture.
- Data lifecycle decisions.
- Provider evaluation criteria.
- Security and privacy requirements.
- Acceptance criteria.

### Phase 2.1 — Document Management

- PDF upload.
- Private storage.
- Document listing.
- Access controls.
- Document deletion.
- Processing status.

### Phase 2.2 — PDF Processing and OCR

- Native text extraction.
- OCR fallback.
- Page-level evidence.
- Processing reliability.

### Phase 2.3 — AI Requirement Extraction

- Provider integration.
- Structured output.
- Evidence validation.
- Candidate persistence.

### Phase 2.4 — Student Review and Approval

- Review interface.
- Evidence viewer.
- Candidate editing.
- Approval and rejection.
- Safe task creation.

### Phase 2.5 — Evaluation and Hardening

- Quality evaluation.
- Security testing.
- Failure recovery.
- Duplicate prevention.
- Performance testing.

### Phase 2.6 — Announcement Support

Deferred until the syllabus workflow is accepted.

The project instruction dated 2026-11-20 authorizes Phases 2.1–2.5 to proceed
sequentially. Phase 2.6 remains excluded. See
`docs/testing/PHASE_2_IMPLEMENTATION_STATUS.md` for actual implementation,
test evidence, and provider-dependent limitations.

---

## 15. Risks and Mitigations

| Risk                                | Mitigation                                             |
| ----------------------------------- | ------------------------------------------------------ |
| AI invents deadlines                | Evidence-backed extraction and explicit student review |
| OCR mistakes                        | Preserve original page evidence and allow corrections  |
| Duplicate task creation             | Idempotent approval and task relationship              |
| Unauthorized document access        | Private storage, RLS, server-side ownership checks     |
| External provider data exposure     | Provider evaluation, disclosure, and consent           |
| Processing failure                  | Persistent jobs, retries, and observable states        |
| Syllabus deletion affects tasks     | Separate source deletion from approved task lifecycle  |
| Incorrect timezone interpretation   | Reuse existing Phase 1.4 deadline rules                |
| Excessive infrastructure complexity | Start with a simple worker architecture                |

---

## 16. Definition of Done

Phase 2 MVP is not complete merely because AI can extract text.

The complete workflow must demonstrate:

1. An authenticated student can upload a valid PDF.
2. The original document is stored privately.
3. The system can process digital and scanned pages.
4. Requirements are extracted into validated structures.
5. Every candidate has traceable supporting evidence.
6. Uncertain dates remain explicitly uncertain.
7. The student can review and correct candidates.
8. Only explicitly approved candidates become tasks.
9. Retried operations do not create duplicate tasks.
10. Existing task ownership and concurrency protections remain intact.
11. Document deletion follows the approved retention policy.
12. External processing follows the consent and disclosure policy.
13. Automated tests cover security, processing, approval, and failure scenarios.
14. A consolidated verification report demonstrates acceptance.

---

## 17. Approval Gate

This document is an approved specification for the authorized Phases 2.1–2.5
scope. Provider selection, privacy terms, and any paid/external service
commitment remain decision gates before enabling third-party document
processing. The accepted authorization does not permit using hosted Supabase,
production data, or real student documents for provider evaluation.

- Requirements and scope.
- Storage and retention behavior.
- Processing architecture.
- PDF and OCR technology selection.
- AI provider evaluation criteria.
- Data model and migration design.
- API contracts.
- Consent and privacy experience.
- Security and testing strategy.
- Acceptance criteria.

No database migration, source-code change, external AI integration, or infrastructure change is authorized by this document alone.

**End of Phase 2.0 Specification.**
