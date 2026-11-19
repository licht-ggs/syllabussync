# Phase 1.3 academic workspace

## Scope and request flow

The protected dashboard provides student-managed academic years, periods,
subjects, a manually selected current period, and a centralized Archive. It
does not require school or institution details and does not implement tasks,
deadlines, calendars, documents, file cleanup, OCR, or workload features.

The browser sends the current Supabase access token to the Express API. The API
verifies it with Supabase Auth, scopes workspace reads to the verified user,
and forwards the same token through a publishable-key Supabase client. All
mutations call PostgreSQL RPC functions; ownership always comes from
`auth.uid()`, not request fields. Shared Zod schemas validate API inputs and
responses, while database constraints and functions remain authoritative.

## Database model

Migration `20261119030000_create_academic_workspace.sql` adds:

- `academic_years`: user-owned normalized name and timestamps. Names are unique
  per student. Years cannot be archived and can only be deleted while empty.
- `academic_periods`: user and academic-year ownership, free-text name,
  optional dates, archive timestamp, and timestamps. The composite
  `(academic_year_id, user_id)` foreign key prevents cross-owner relationships.
- `subjects`: user and period ownership, required name, optional code,
  instructor, numeric units, `schedule_text`, room, `is_active`, and timestamps.
  The composite `(academic_period_id, user_id)` foreign key prevents
  cross-owner relationships.
- `workspace_settings`: one row per user, created only when the user selects
  a current period. Its nullable current-period pointer has a composite
  ownership foreign key with `ON DELETE RESTRICT`.

All tables enable RLS. Authenticated users can read their own rows; anonymous
users cannot read them. Authenticated roles have no direct INSERT, UPDATE, or
DELETE privileges. RPC functions are `SECURITY DEFINER` only where needed,
run with an empty `search_path`, fully qualify application objects, derive the
owner from `auth.uid()`, and are executable only by `authenticated`.

An Auth-user `BEFORE DELETE` trigger removes workspace settings before owned
periods cascade, so the current-period `RESTRICT` foreign key does not prevent
account cleanup. The migration does not change the Phase 1.2 authentication
flow.

## Name normalization and ordering

Year and period names are trimmed using the shared Unicode whitespace helper,
normalized to Unicode NFC, and have supported dash variants mapped to ASCII
hyphen. The unique indexes compare the canonicalized names case-insensitively.
The same canonicalization is applied before persistence. Subject names are
Unicode-trimmed and NFC-normalized but do not participate in the academic-name
uniqueness indexes.

The API orders periods within each academic year with dated periods first,
`start_date` ascending, then creation timestamp and ID as deterministic
tie-breakers. Undated periods follow, ordered by creation timestamp and ID.
No period is selected from its dates.

## Current period and archive lifecycle

The user explicitly selects or switches the current period. Creating a period
never selects it in the database; the first-period form offers a separate,
explicit one-tap selection option. Archiving the current period clears its
pointer in the same transaction. Both selection and archive lock the period
before modifying settings, and a trigger prevents settings from pointing to an
archived period. Restoring a period never selects it.

The Archive has two views:

- Archived periods are grouped under their academic years and display their
  subjects as part of the period entry.
- Individually archived subjects appear only when their parent period is
  active. A subject under an archived period is not listed again in the
  Subjects view.

Archiving a period changes only `archived_at`; it does not rewrite subject
`is_active` values. Subject restore is rejected while its parent period is
archived. Restoring the period reveals each subject's preserved state.

## Permanent deletion safeguards

Permanent deletion is available only for archived subjects and periods. A
period deletion includes all its subjects; an academic year can be deleted
only when it contains no periods. The browser dialog presents only existing
records, warns that deletion is irreversible, starts a five-second
`aria-live` countdown, and requires a separate click after the countdown. It
does not focus the destructive button or delete automatically; cancel/Escape
closes the dialog and resets its timer.

The API sends the displayed child count and `updated_at` to the deletion RPC.
The database locks the parent and rechecks eligibility and counts before
deleting. Subject mutations also advance the parent period timestamp, so an
edited child invalidates a previously displayed period summary. A stale
summary returns current counts/details and the UI restarts the countdown.
Period deletion and its subject cascade occur in one database statement.

## Verification state

The migration and pgTAP suite are present but must be applied and executed
against an isolated local database before they can be considered verified.
They must not be applied to hosted Supabase as part of this implementation.
See [PHASE_1_3_VERIFICATION.md](../testing/PHASE_1_3_VERIFICATION.md) for the
commands actually run and remaining limitations.
