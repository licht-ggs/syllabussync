create table public.academic_requirement_candidates (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  title text not null,
  description text not null default '',
  category text not null,
  source_page integer not null,
  evidence_excerpt text not null,
  original_date_expression text,
  normalized_due_date date,
  normalized_due_time time,
  deadline_certainty text not null,
  confidence numeric(4,3) not null,
  ambiguity_notes text[] not null default '{}',
  review_status text not null default 'pending_review',
  extraction_provider text not null,
  extraction_model text not null,
  created_task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint academic_requirement_candidates_document_owner_fkey
    foreign key (document_id, owner_id)
    references public.academic_documents (id, owner_id) on delete cascade,
  constraint academic_requirement_candidates_subject_owner_fkey
    foreign key (subject_id, owner_id)
    references public.subjects (id, user_id) on delete set null (subject_id),
  constraint academic_requirement_candidates_task_owner_fkey
    foreign key (created_task_id, owner_id)
    references public.tasks (id, user_id) on delete set null (created_task_id),
  constraint academic_requirement_candidates_task_unique unique (created_task_id),
  constraint academic_requirement_candidates_title_check
    check (char_length(public.trim_unicode_whitespace(title)) between 1 and 200),
  constraint academic_requirement_candidates_description_check
    check (char_length(description) <= 2000),
  constraint academic_requirement_candidates_category_check
    check (category in ('assignment', 'examination', 'quiz', 'project', 'presentation', 'laboratory', 'report', 'activity', 'other')),
  constraint academic_requirement_candidates_source_page_check
    check (source_page between 1 and 200),
  constraint academic_requirement_candidates_evidence_check
    check (char_length(public.trim_unicode_whitespace(evidence_excerpt)) between 1 and 1200),
  constraint academic_requirement_candidates_confidence_check
    check (confidence between 0 and 1),
  constraint academic_requirement_candidates_deadline_check
    check (
      (normalized_due_time is null or normalized_due_date is not null)
      and (deadline_certainty = 'exact' or normalized_due_date is null)
      and (deadline_certainty <> 'unspecified' or original_date_expression is null)
    ),
  constraint academic_requirement_candidates_certainty_check
    check (deadline_certainty in ('exact', 'ambiguous', 'relative', 'unspecified')),
  constraint academic_requirement_candidates_status_check
    check (review_status in ('pending_review', 'edited', 'approved', 'rejected')),
  constraint academic_requirement_candidates_approval_check
    check (review_status <> 'approved' or reviewed_at is not null)
);

create index academic_requirement_candidates_owner_document_idx
  on public.academic_requirement_candidates (owner_id, document_id, created_at, id);

alter table public.academic_requirement_candidates enable row level security;
revoke all on table public.academic_requirement_candidates from public, anon, authenticated;
grant select on table public.academic_requirement_candidates to authenticated;
grant update (
  title, description, category, subject_id, original_date_expression,
  normalized_due_date, normalized_due_time, deadline_certainty, review_status
) on table public.academic_requirement_candidates to authenticated;
grant all on table public.academic_requirement_candidates to service_role;

create policy "Requirement candidates are readable by their owner"
  on public.academic_requirement_candidates for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can edit unreviewed requirement candidates"
  on public.academic_requirement_candidates for update to authenticated
  using ((select auth.uid()) = owner_id and review_status in ('pending_review', 'edited') and created_task_id is null)
  with check ((select auth.uid()) = owner_id and review_status in ('pending_review', 'edited') and created_task_id is null);

create trigger academic_requirement_candidates_set_updated_at
  before update on public.academic_requirement_candidates
  for each row execute function public.touch_academic_updated_at();

create function public.reject_academic_requirement_candidate(p_candidate_id uuid)
returns public.academic_requirement_candidates
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.academic_requirement_candidates;
begin
  update public.academic_requirement_candidates
    set review_status = 'rejected', reviewed_at = now()
    where id = p_candidate_id and owner_id = auth.uid()
      and review_status in ('pending_review', 'edited') and created_task_id is null
    returning * into result;
  if not found then
    raise exception 'Candidate not found or already reviewed' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create function public.approve_academic_requirement_candidate(
  p_candidate_id uuid,
  p_subject_id uuid,
  p_due_date date,
  p_due_time time,
  p_due_timezone text,
  p_due_at timestamptz,
  p_priority text,
  p_estimated_duration_minutes integer,
  p_reference_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  candidate public.academic_requirement_candidates;
  task_result jsonb;
  task_type text;
  custom_type text;
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into candidate
    from public.academic_requirement_candidates
    where id = p_candidate_id and academic_requirement_candidates.owner_id = v_owner_id
    for update;
  if not found or candidate.review_status not in ('pending_review', 'edited') or candidate.created_task_id is not null then
    raise exception 'Candidate not found or already reviewed' using errcode = 'P0002';
  end if;
  if candidate.subject_id is distinct from p_subject_id then
    raise exception 'Select and save the candidate subject before approval' using errcode = '22023';
  end if;
  if candidate.deadline_certainty <> 'exact' or candidate.normalized_due_date is null or candidate.normalized_due_date <> p_due_date then
    raise exception 'Confirm an exact deadline before creating a task' using errcode = '22023';
  end if;

  task_type := case candidate.category
    when 'assignment' then 'Assignment'
    when 'examination' then 'Examination'
    when 'quiz' then 'Quiz'
    when 'project' then 'Project'
    when 'activity' then 'Activity'
    else 'Other'
  end;
  custom_type := case when task_type = 'Other' then initcap(candidate.category) else null end;

  task_result := public.create_task(
    p_subject_id, candidate.title, nullif(candidate.description, ''), task_type,
    custom_type, p_due_date, p_due_time, p_due_timezone, p_due_at,
    p_priority, p_estimated_duration_minutes, p_reference_url
  );
  if task_result->>'status' <> 'created' or task_result->'task'->>'user_id' <> v_owner_id::text then
    raise exception 'Task creation failed' using errcode = 'P0001';
  end if;

  update public.academic_requirement_candidates
    set review_status = 'approved', created_task_id = (task_result->'task'->>'id')::uuid,
        reviewed_at = now()
    where id = candidate.id and academic_requirement_candidates.owner_id = v_owner_id;

  return jsonb_build_object('status', 'created', 'candidate_id', candidate.id, 'task', task_result->'task');
end;
$$;

revoke all on function public.reject_academic_requirement_candidate(uuid) from public, anon, authenticated;
revoke all on function public.approve_academic_requirement_candidate(uuid, uuid, date, time, text, timestamptz, text, integer, text) from public, anon, authenticated;
grant execute on function public.reject_academic_requirement_candidate(uuid) to authenticated;
grant execute on function public.approve_academic_requirement_candidate(uuid, uuid, date, time, text, timestamptz, text, integer, text) to authenticated;
