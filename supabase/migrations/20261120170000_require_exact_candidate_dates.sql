alter table public.academic_requirement_candidates
  add constraint academic_requirement_candidates_exact_date_check
  check (deadline_certainty <> 'exact' or normalized_due_date is not null);
