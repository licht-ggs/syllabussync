begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
) values
  ('13131313-1313-4131-8131-131313131313', 'processing-owner@example.test', now(), '{}', '{}'),
  ('14141414-1414-4141-8141-141414141414', 'processing-other@example.test', now(), '{}', '{}');

select has_table('public', 'academic_document_processing_jobs', 'processing jobs are persisted');
select has_table('public', 'academic_document_pages', 'page-level extraction is persisted');
select ok(
  not has_table_privilege('authenticated', 'public.academic_document_processing_jobs', 'INSERT'),
  'authenticated users cannot write processing jobs directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.academic_document_pages', 'INSERT'),
  'authenticated users cannot write extracted page content directly'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', true);
select lives_ok(
  $$select public.register_academic_document(
    '21212121-2121-4121-8121-212121212121', null, 'Syllabus.pdf', 2048,
    repeat('a', 64), 3,
    '13131313-1313-4131-8131-131313131313/21212121-2121-4121-8121-212121212121.pdf'
  )$$,
  'the owner can register a document'
);
select lives_ok(
  $$select public.set_academic_document_upload_status(
    '21212121-2121-4121-8121-212121212121', 'uploaded'
  )$$,
  'the owner can finalize the upload'
);
select lives_ok(
  $$select public.queue_academic_document_processing('21212121-2121-4121-8121-212121212121')$$,
  'the owner can queue processing'
);
select lives_ok(
  $$select public.queue_academic_document_processing('21212121-2121-4121-8121-212121212121')$$,
  'retrying a queue request returns the active job instead of duplicating it'
);
select is(
  (select count(*)::integer from public.academic_document_processing_jobs),
  1,
  'idempotent queueing creates one job'
);
select is(
  (select count(*)::integer from public.academic_document_processing_jobs),
  1,
  'the owner can read their processing job'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_academic_document_processing_job()', 'EXECUTE'),
  'authenticated users cannot execute the worker claim function'
);
select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', true);
select is(
  (select count(*)::integer from public.academic_document_processing_jobs),
  0,
  'another owner cannot read the processing job'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select * from public.claim_academic_document_processing_job()$$,
  'the worker role can claim a queued job'
);
select lives_ok(
  $$select public.save_academic_document_processing_pages(
    (select id from public.academic_document_processing_jobs where status = 'processing' limit 1),
    '[{"page_number":1,"extracted_text":"Assignment one is due on October 12.","extraction_method":"native_text","extraction_status":"completed","error_code":null},{"page_number":2,"extracted_text":"","extraction_method":"none","extraction_status":"completed","error_code":null},{"page_number":3,"extracted_text":"Final project details.","extraction_method":"native_text","extraction_status":"completed","error_code":null}]'::jsonb
  )$$,
  'the worker atomically persists pages only while its document is processing'
);
select lives_ok(
  $$select public.update_academic_document_processing_progress(
    (select id from public.academic_document_processing_jobs limit 1), 70
  )$$,
  'the worker can record processing progress'
);
select lives_ok(
  $$select public.complete_academic_document_processing(
    (select id from public.academic_document_processing_jobs limit 1), true, null
  )$$,
  'the worker can complete a successful job'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', true);
select is(
  (select processing_status from public.academic_documents where id = '21212121-2121-4121-8121-212121212121'),
  'text_extracted',
  'successful processing updates the document status'
);
select is(
  (select count(*)::integer from public.academic_document_pages where document_id = '21212121-2121-4121-8121-212121212121'),
  3,
  'the owner can read extracted page text'
);
select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', true);
select is(
  (select count(*)::integer from public.academic_document_pages where document_id = '21212121-2121-4121-8121-212121212121'),
  0,
  'another owner cannot read extracted page text'
);
reset role;
select * from finish();
rollback;
