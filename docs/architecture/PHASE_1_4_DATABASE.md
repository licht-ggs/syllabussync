# Phase 1.4 database foundation

## Scope and dependencies

Migration `20261119135500_create_tasks_and_history.sql` is additive and depends
on the profile and academic workspace migrations:

1. `20261118180000_create_profiles.sql`
2. `20261119030000_create_academic_workspace.sql`
3. `20261119135500_create_tasks_and_history.sql`
4. `20261119150000_add_task_subject_reassignment.sql`

It does not replace the academic tables or change the approved Phase 1.2/1.3
authentication and workspace model. The follow-up migration extends the
accepted Stage 1 task schema without rewriting the original migration or
migration history. This document describes the database foundation only; task
API routes and frontend views are later stages.

## Workspace timezone

`workspace_settings.preferred_timezone` is non-null and defaults to
`Asia/Manila`. The existing current-period pointer, primary key, timestamps,
and ownership foreign key remain unchanged. `set_preferred_timezone` uses an
upsert keyed by `user_id` and updates only the timezone, so it preserves an
existing current-period selection. It also creates a settings row when a user
has not selected a period yet.

The database validates timezone names against PostgreSQL's
`pg_timezone_names`. The application may prefer a valid browser timezone when
it is first saved; `Asia/Manila` is the fallback when no valid browser
preference has been saved. Changing the preferred timezone does not alter
stored task deadlines.

## Tasks and ownership

`tasks` stores:

- Owner and required subject IDs.
- Title, optional description, task type, and optional custom type.
- Required date-only due date, optional due time, IANA timezone, and resolved
  instant.
- Priority, student-controlled status, optional estimated duration and
  reference URL.
- Optimistic version and server-controlled timestamps.

Allowed task types are `Assignment`, `Quiz`, `Examination`, `Project`,
`Activity`, `Laboratory`, `Practical Exam`, and `Other`. `Other` requires a
non-empty `custom_type`; all other types require `custom_type` to be null.
Allowed priorities are `Low`, `Normal`, `High`, and `Urgent`. Allowed statuses
are `Not Started`, `In Progress`, and `Completed`. New tasks start as `Not
Started`. Deadline passage never changes status automatically.

The unique `(id, user_id)` key and composite `(subject_id, user_id)` foreign
key ensure a task belongs to exactly one subject owned by that task's user.
Task and history rows reference `auth.users` with cascade cleanup. History
references `(task_id, user_id)` and cascades when its task is permanently
deleted.

Indexes support owner/subject deadlines, owner deadline and status views, and
owner/task history chronology.

## Deadline and daylight-saving policy

All-day tasks have `due_date` only: `due_time`, `due_timezone`, and `due_at`
must all be null. Timed tasks require all four deadline fields and a valid
timezone. The supplied `due_at` must round-trip through that timezone to the
stored local date and time.

The database does not guess an instant from a local date/time:

- A nonexistent spring-forward time is rejected because no instant round-trips
  to that local wall time.
- For a repeated fall-back time, either real occurrence is valid only when its
  corresponding `due_at` is explicitly supplied. The database preserves that
  selected instant and does not choose one implicitly.

The future API must make any ambiguous-time choice explicit to the user and
send the resolved instant. No task API or UI behavior is implemented in this
stage.

## History and mutation functions

`task_history` stores task/user IDs, event type, old/new JSON objects, and a
server-generated change timestamp. It supports `status_changed`,
`deadline_changed`, and `subject_reassigned` events. Reassignment events
record the old and new subject IDs. A single update may emit one event for
each changed category; it never duplicates an event for an unchanged
category. Creation does not create history.

Authenticated users receive owner-scoped `SELECT` only on tasks and history.
Direct authenticated inserts, updates, and deletes are revoked. History can
only be appended by protected task functions and cannot be directly changed or
deleted by ordinary authenticated users.

`set_preferred_timezone`, `create_task`, `update_task`, and `delete_task` are
`SECURITY DEFINER` functions with an empty `search_path`, explicit object
qualification, and ownership derived from `auth.uid()`. They are executable
only by `authenticated`. Helper and trigger functions are not exposed as RPCs.

Task creation is atomic and does not create a history event. Updates require
the expected task version; a stale version returns `review_required`.
Status, deadline, and subject changes are recorded in the same transaction as
the task update, so a failed history insert rolls back the task update.
Reassignment is permitted only to the owner's active subject in a
non-archived period. Existing tasks under archived parents remain editable in
place, but cannot be reassigned to an archived destination. Task deletion
requires the expected version and cascades to its history.

## Archived-parent behavior and locking

A before-insert trigger locks the parent academic period, then subject, and
rejects creation under an archived period or inactive subject. Existing tasks
remain valid and manageable when either parent is archived; no archive
operation modifies task status or other task values.

Task updates/deletes lock period, subject, then task. Reassignment locks the
source and destination periods in stable ID order, then their subjects in
stable ID order, before locking the task. This preserves the parent-before-task
ordering and avoids opposite-direction moves acquiring parent locks in
different orders. Subject deletion keeps the existing period-then-subject
order. Period deletion locks the period then its subjects in stable ID order.
Task creation uses the same period-then-subject order as parent deletion. Task
mutations touch the parent subject and period timestamps; reassignment touches
both source and destination parents so the existing reviewed-deletion
timestamp detects task changes.

The existing subject and period deletion function signatures are preserved.
They recount associated tasks and history under the parent locks, include
those counts in review/deletion results, delete tasks before subjects/periods,
and rely on the task-to-history cascade for history cleanup. Subject and
period deletion remains atomic. The academic-year rule remains unchanged: a
year cannot be deleted while periods exist. The existing auth-user
before-delete cleanup of workspace settings is unchanged; task and history
foreign keys cascade account deletion.

Locking behavior has not been verified with concurrent database sessions in
this environment. The ordering above is the intended serialization contract,
not a claim of executed concurrency tests.
