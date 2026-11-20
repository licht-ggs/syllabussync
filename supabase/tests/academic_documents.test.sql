begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '13131313-1313-4131-8131-131313131313',
    'document-owner@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  ),
  (
    '14141414-1414-4141-8141-141414141414',
    'document-other@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  );

select has_table('public', 'academic_documents', 'the academic documents table exists');
select ok(
  not has_table_privilege('authenticated', 'public.academic_documents', 'INSERT'),
  'authenticated users cannot insert document metadata directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.academic_documents', 'DELETE'),
  'authenticated users cannot delete document metadata directly'
);
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'academic-documents' and public = false
  ),
  'the academic documents bucket is private'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', true);

select lives_ok(
  $$select public.register_academic_document(
    '21212121-2121-4121-8121-212121212121',
    null,
    'Syllabus.pdf',
    2048,
    repeat('a', 64),
    3,
    '13131313-1313-4131-8131-131313131313/21212121-2121-4121-8121-212121212121.pdf'
  )$$,
  'the authenticated owner can register a document through the protected function'
);

select is(
  (select count(*)::integer from public.academic_documents),
  1,
  'the owner can read their document metadata'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values (
    'academic-documents',
    '13131313-1313-4131-8131-131313131313/21212121-2121-4121-8121-212121212121.pdf'
  )$$,
  'the owner can upload an object into their private storage path'
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'academic-documents'),
  1,
  'the owner can retrieve their stored object metadata'
);

select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', true);
select is(
  (select count(*)::integer from public.academic_documents),
  0,
  'another user cannot read the document metadata'
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'academic-documents'),
  0,
  'another user cannot retrieve the private object'
);
select ok(
  exists (
    select 1 from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polcmd = 'd'
      and pg_get_expr(polqual, polrelid) like '%academic-documents%'
      and pg_get_expr(polqual, polrelid) like '%auth.uid%'
  ),
  'the storage delete policy limits deletion to the object owner'
);
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', true);
select throws_ok(
  $$select public.register_academic_document(
    '22222222-2222-4222-8222-222222222222',
    null,
    'Other.pdf',
    2048,
    repeat('b', 64),
    1,
    '14141414-1414-4141-8141-141414141414/22222222-2222-4222-8222-222222222222.pdf'
  )$$,
  '22023',
  'Invalid document storage path',
  'an owner cannot register a document under another owner storage path'
);

select lives_ok(
  $$select public.mark_academic_document_deletion_pending(
    '21212121-2121-4121-8121-212121212121'
  )$$,
  'the owner can mark their document for deletion'
);

select lives_ok(
  $$select public.complete_academic_document_deletion(
    '21212121-2121-4121-8121-212121212121'
  )$$,
  'the owner can complete deletion after removing the stored file'
);

reset role;
select * from finish();
rollback;
