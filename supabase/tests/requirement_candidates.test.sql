begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('13131313-1313-4131-8131-131313131313', 'candidate-owner@example.test', now(), '{}', '{}'),
  ('14141414-1414-4141-8141-141414141414', 'candidate-other@example.test', now(), '{}', '{}');

insert into public.academic_years (id, user_id, name) values
  ('21212121-2121-4121-8121-212121212121', '13131313-1313-4131-8131-131313131313', 'Test Year');
insert into public.academic_periods (id, user_id, academic_year_id, name) values
  ('22222222-2222-4222-8222-222222222222', '13131313-1313-4131-8131-131313131313', '21212121-2121-4121-8121-212121212121', 'Test Period');
insert into public.subjects (id, user_id, academic_period_id, name) values
  ('23232323-2323-4323-8323-232323232323', '13131313-1313-4131-8131-131313131313', '22222222-2222-4222-8222-222222222222', 'Test Subject');

insert into public.academic_documents (
  id, owner_id, subject_id, filename, file_size, sha256, page_count, storage_path, processing_status
) values (
  '31313131-3131-4131-8131-313131313131', '13131313-1313-4131-8131-131313131313',
  '23232323-2323-4323-8323-232323232323', 'Test.pdf', 1024, repeat('a', 64), 1,
  '13131313-1313-4131-8131-131313131313/31313131-3131-4131-8131-313131313131.pdf', 'text_extracted'
);
insert into public.academic_requirement_candidates (
  id, document_id, owner_id, subject_id, title, description, category, source_page,
  evidence_excerpt, original_date_expression, normalized_due_date, deadline_certainty,
  confidence, review_status, extraction_provider, extraction_model
) values (
  '41414141-4141-4141-8141-414141414141', '31313131-3131-4131-8131-313131313131',
  '13131313-1313-4131-8131-131313131313', '23232323-2323-4323-8323-232323232323',
  'Assignment one', 'Submit assignment one.', 'assignment', 1,
  'Assignment one is due on 2027-06-03.', 'June 3, 2027', '2027-06-03', 'exact',
  0.9, 'pending_review', 'test-provider', 'test-model'
);

select has_table('public', 'academic_requirement_candidates', 'requirement candidates are persisted');
select ok(
  not has_table_privilege('authenticated', 'public.academic_requirement_candidates', 'INSERT'),
  'authenticated users cannot insert AI candidates directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.academic_requirement_candidates', 'DELETE'),
  'authenticated users cannot delete candidate evidence directly'
);
select ok(
  not has_column_privilege('authenticated', 'public.academic_requirement_candidates', 'updated_at', 'UPDATE'),
  'candidate review timestamps remain database controlled'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', true);
select is(
  (select count(*)::integer from public.academic_requirement_candidates), 1,
  'the owner can read their candidate'
);
select lives_ok(
  $$update public.academic_requirement_candidates
      set title = 'Assignment one corrected', review_status = 'edited'
    where id = '41414141-4141-4141-8141-414141414141'$$,
  'the owner can edit an unreviewed candidate'
);
select lives_ok(
  $$select public.approve_academic_requirement_candidate(
    '41414141-4141-4141-8141-414141414141',
    '23232323-2323-4323-8323-232323232323', '2027-06-03', null, null, null,
    'Normal', null, null
  )$$,
  'the owner can approve an exact candidate and create a task'
);
select is(
  (select review_status from public.academic_requirement_candidates where id = '41414141-4141-4141-8141-414141414141'),
  'approved', 'approval marks the candidate only after task creation'
);
select is(
  (select count(*)::integer from public.tasks where title = 'Assignment one corrected'), 1,
  'approval creates one existing-system task'
);
select throws_ok(
  $$select public.approve_academic_requirement_candidate(
    '41414141-4141-4141-8141-414141414141',
    '23232323-2323-4323-8323-232323232323', '2027-06-03', null, null, null,
    'Normal', null, null
  )$$,
  'P0002', null, 'retry cannot create a duplicate task'
);
select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', true);
select is(
  (select count(*)::integer from public.academic_requirement_candidates), 0,
  'another owner cannot read the candidate'
);
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', true);
select lives_ok(
  $$select public.mark_academic_document_deletion_pending('31313131-3131-4131-8131-313131313131')$$,
  'the owner can begin source document deletion'
);
select lives_ok(
  $$select public.complete_academic_document_deletion('31313131-3131-4131-8131-313131313131')$$,
  'the source document and derived candidate can be removed'
);
select is(
  (select count(*)::integer from public.tasks where title = 'Assignment one corrected'), 1,
  'deleting the source does not delete an approved task'
);
reset role;

select * from finish();
rollback;
