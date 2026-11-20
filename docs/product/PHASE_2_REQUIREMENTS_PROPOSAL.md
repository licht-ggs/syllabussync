# Phase 2 — Product Requirements Proposal

> **Superseded draft:** Use [Phase 2.0 Requirements and Architecture](../architecture/PHASE_2_REQUIREMENTS_AND_ARCHITECTURE.md)
> as the current consolidated draft. This earlier proposal is retained as
> project history and is not the source of current Phase 2 decisions.

**Status:** Proposed for product review. This document is not implementation
authorization and does not approve database, API, storage, or provider choices.

## Goal

Help a student turn a syllabus or course announcement into accurate,
reviewable academic task candidates, with each extracted requirement linked to
evidence in the original document. The student remains in control: no
candidate becomes a task and no existing task changes until the student
reviews and explicitly approves an action.

## User problem and validation hypothesis

Students spend time locating deadlines and requirements across course
documents and manually transferring them into their workload system. The
hypothesis is that a source-grounded extraction and review flow reduces that
work without reducing trust. Validate this with students before expanding the
feature; do not treat the hypothesis as established research.

## Initial user and workflow

The first user is an authenticated student with an existing SyllabusSync
academic workspace. Instructor, coordinator, and institution workflows are
outside the initial scope.

1. The student selects a subject and supplies a syllabus or announcement.
2. SyllabusSync processes it asynchronously and shows job progress and any
   recoverable failure.
3. The student reviews proposed requirements beside the relevant original
   evidence. Unclear or incomplete fields are marked for review rather than
   guessed.
4. The student may edit, approve, or reject each candidate.
5. Only an explicitly approved candidate is sent through the existing task
   creation flow. Processing never edits or completes an existing task.

## Recommended MVP boundary

- Start with PDF course documents. Treat selectable-text PDFs and scanned
  pages as separate processing paths; use OCR only for pages that need it.
- Extract only task-like requirements supported by the approved task model:
  title, subject, task type, description where supported, deadline, and source
  evidence. Do not infer grade weight, study plans, or calendar events in this
  MVP.
- For every candidate, show source document identity and page number plus the
  exact supporting text. If reliable page evidence cannot be produced, mark
  that candidate for manual entry instead of presenting it as verified.
- Preserve date-only deadlines as date-only. Never infer a deadline time or
  timezone from a date. Treat ambiguous dates, relative dates, contradictory
  instructions, and daylight-saving ambiguity as questions for the student.
- Make review per candidate so a student can approve one item and reject
  another. Do not require acceptance of the entire extraction result.
- Do not implement calendar functionality, automatic task changes, institutional
  onboarding, or the paused Dashboard expansion as part of Phase 2 MVP.

## MVP acceptance criteria

- A student can submit a supported document for processing and see a clear
  processing state, completion state, or actionable failure.
- The result is a list of proposed items, not saved tasks.
- Every suggested field that can affect a task is visibly supported by source
  evidence or explicitly marked uncertain/absent.
- Students can inspect the evidence, edit candidate values, approve individual
  candidates, and reject candidates.
- A task is created only after explicit approval and passes the existing task
  validation and authorization path.
- The system never silently changes an existing task or its confirmed
  deadline.
- The original source remains available for review for the approved retention
  period; failed or rejected processing does not silently erase a student's
  source.
- Users can request deletion of their document and associated extraction data
  under a clearly stated retention policy.
- Cross-user access is prevented at every API and storage boundary.

## Quality evaluation

Before a pilot, assemble a small, permissioned evaluation set representing
ordinary and difficult documents, including scanned pages, ambiguous dates,
multiple subjects, and conflicting deadline statements. Have people verify
each expected field against the source. Report field-level correctness,
evidence correctness, abstention behavior, and processing failures separately.
Do not combine them into one accuracy score that hides unsupported guesses.

Set numerical launch thresholds only after the team has a reviewed evaluation
set and a baseline. Do not claim extraction is reliable based only on schema
validity or a few hand-picked examples.

## Explicit non-goals

- Automatic creation, correction, completion, or deletion of tasks.
- An AI assistant that answers questions beyond the supplied source.
- Calendar UI or calendar synchronization.
- Personalized study scheduling or workload forecasting.
- Institution-managed accounts or institution-specific policy.
- Training or fine-tuning a model on student documents.
- A custom OCR or LLM model before evaluation shows a need.

## Decisions required before implementation

The following product/security decisions remain open. Resolve them before
building storage, upload, processing, or review APIs:

1. **Supported inputs:** confirm PDF-only for the first slice and define file
   size, page count, password-protected file, and malformed-file behavior.
2. **Retention and deletion:** decide how long originals, extracted text,
   candidate results, and logs remain, and whether accepted task evidence
   persists after deleting the original.
3. **Processing provider and region:** choose a provider/deployment only after
   reviewing data residency, retention, model-training, subprocessors, and
   incident terms. No provider is selected by this proposal.
4. **Consent and disclosure:** decide what students must be told before
   uploading and how third-party processing is disclosed.
5. **Evidence persistence:** decide whether source citations are retained with
   accepted tasks and, if so, approve a data model and API contract for them.
   Do not put citations into unrelated task fields as a workaround.
6. **Evaluation and pilot:** recruit permissioned student reviewers, establish
   the evaluation set, and set launch thresholds based on observed quality.
7. **Operational budget:** establish acceptable processing cost, latency,
   retry limits, and support expectations.

## Product safety rules

- Source documents remain the authority. Model output is a proposal, not a
  confirmed academic requirement.
- Show the student the evidence before approval; make uncertainty legible.
- Never silently alter a confirmed task, deadline, or status.
- Do not use one student's documents or results to answer another student's
  request.
- Do not expose provider keys or service credentials to the browser.
- Preserve user ownership, authenticated server authorization, RLS, shared
  validation, and explicit deletion controls.

## Suggested delivery sequence

1. Validate the workflow and open decisions with students and the product
   owner.
2. Approve data handling, file policy, provider constraints, and evidence
   retention.
3. Design and review the API/data boundaries before any schema or contract
   changes.
4. Build a narrow PDF-to-candidate vertical slice behind authenticated,
   private storage and asynchronous processing.
5. Add human review and explicit task creation through the existing task path.
6. Evaluate with the permissioned set, address failures, and decide whether to
   expand input types or capabilities.

No Phase 2 application code, storage configuration, database schema, API
contract, or processing provider is authorized by this proposal alone.
