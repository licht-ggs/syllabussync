begin;

create extension if not exists pgtap with schema extensions;
select plan(54);

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'phase13-owner@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'phase13-other@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  );

insert into public.academic_years (id, user_id, name)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '22222222-2222-4222-8222-222222222222',
  'Other student year'
);

insert into public.academic_periods (id, user_id, academic_year_id, name)
values (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '22222222-2222-4222-8222-222222222222',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'Other student period'
);

select has_table('public', 'academic_years', 'academic years table exists');
select has_table('public', 'academic_periods', 'academic periods table exists');
select has_table('public', 'subjects', 'subjects table exists');
select has_table('public', 'workspace_settings', 'workspace settings table exists');

select ok(
  has_table_privilege('authenticated', 'public.academic_years', 'SELECT'),
  'authenticated users can select academic years'
);
select ok(
  not has_table_privilege('authenticated', 'public.academic_years', 'INSERT')
  and not has_table_privilege('authenticated', 'public.academic_years', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.academic_years', 'DELETE')
  and not has_table_privilege('authenticated', 'public.academic_periods', 'INSERT')
  and not has_table_privilege('authenticated', 'public.academic_periods', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.academic_periods', 'DELETE')
  and not has_table_privilege('authenticated', 'public.subjects', 'INSERT')
  and not has_table_privilege('authenticated', 'public.subjects', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.subjects', 'DELETE')
  and not has_table_privilege('authenticated', 'public.workspace_settings', 'INSERT')
  and not has_table_privilege('authenticated', 'public.workspace_settings', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.workspace_settings', 'DELETE'),
  'authenticated users cannot directly mutate academic tables'
);
select ok(
  not has_table_privilege('anon', 'public.academic_years', 'SELECT')
  and not has_table_privilege('anon', 'public.academic_periods', 'SELECT')
  and not has_table_privilege('anon', 'public.subjects', 'SELECT')
  and not has_table_privilege('anon', 'public.workspace_settings', 'SELECT'),
  'anonymous users cannot read academic data'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_academic_year(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.permanently_delete_archived_period(uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated users can execute the approved mutation RPCs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_academic_year(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.permanently_delete_archived_period(uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous users cannot execute academic mutation RPCs'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select set_config(
  'phase13.year_id',
  (public.create_academic_year(' 2026–2027 ')).id::text,
  true
);
select set_config(
  'phase13.year_updated_at',
  (
    select updated_at::text
    from public.academic_years
    where id = current_setting('phase13.year_id')::uuid
  ),
  true
);
select is(
  (
    select name
    from public.academic_years
    where id = current_setting('phase13.year_id')::uuid
  ),
  '2026-2027',
  'academic year names are trimmed and dash-normalized'
);
select throws_ok(
  $$select public.create_academic_year('2026-2027')$$,
  '23505',
  null,
  'academic year uniqueness ignores case and dash variants'
);
select set_config(
  'phase13.case_year_id',
  (public.create_academic_year('Autumn Term')).id::text,
  true
);
select throws_ok(
  $$select public.create_academic_year('AUTUMN TERM')$$,
  '23505',
  null,
  'academic year uniqueness is case-insensitive'
);
select set_config(
  'phase13.unicode_year_id',
  (public.create_academic_year('Café')).id::text,
  true
);
select throws_ok(
  $$select public.create_academic_year(U&'Cafe\0301')$$,
  '23505',
  null,
  'academic year uniqueness applies Unicode NFC normalization'
);

select set_config(
  'phase13.period_one_id',
  (
    public.create_academic_period(
      current_setting('phase13.year_id')::uuid,
      'First–Term',
      date '2026-09-01',
      date '2027-01-15'
    )
  ).id::text,
  true
);
select set_config(
  'phase13.period_two_id',
  (
    public.create_academic_period(
      current_setting('phase13.year_id')::uuid,
      'Second Term',
      date '2027-01-16',
      date '2027-06-30'
    )
  ).id::text,
  true
);
select throws_ok(
  $$
    select public.permanently_delete_archived_period(
      current_setting('phase13.period_one_id')::uuid,
      0,
      now()
    )
  $$,
  '23514',
  null,
  'an active period cannot be permanently deleted'
);
select ok(
  (
    select user_id = auth.uid()
      and academic_year_id = current_setting('phase13.year_id')::uuid
    from public.academic_periods
    where id = current_setting('phase13.period_one_id')::uuid
  ),
  'period creation derives its owner and keeps its academic year'
);
select is(
  (
    select count(*)::integer
    from public.workspace_settings
    where user_id = auth.uid()
  ),
  0,
  'creating years and periods does not create settings or select a period'
);
select throws_ok(
  $$
    select public.create_academic_period(
      current_setting('phase13.year_id')::uuid,
      'First-Term',
      null,
      null
    )
  $$,
  '23505',
  null,
  'period uniqueness ignores case and dash variants within a year'
);
select throws_ok(
  $$
    select public.create_academic_period(
      current_setting('phase13.year_id')::uuid,
      'first–term',
      null,
      null
    )
  $$,
  '23505',
  null,
  'period uniqueness is case-insensitive'
);
select throws_ok(
  $$
    select public.create_academic_period(
      current_setting('phase13.year_id')::uuid,
      'Invalid date period',
      date '2027-02-01',
      date '2027-01-01'
    )
  $$,
  '23514',
  null,
  'period end date cannot precede its start date'
);
select is(
  (
    select count(*)::integer
    from public.academic_periods
    where user_id = auth.uid()
      and name = 'Invalid date period'
  ),
  0,
  'a failed period creation leaves no partial row'
);
select is(
  (
    select count(*)::integer
    from public.academic_years
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  0,
  'row-level security hides another student academic year'
);
select throws_ok(
  $$
    select public.create_academic_period(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'Cross-owner period',
      null,
      null
    )
  $$,
  'P0002',
  null,
  'a student cannot create a period in another students year'
);
select throws_ok(
  $$
    select public.update_academic_year(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'Stolen year'
    )
  $$,
  'P0002',
  null,
  'a student cannot update another students year'
);
select throws_ok(
  $$
    select public.create_subject(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'Cross-owner subject'
    )
  $$,
  'P0002',
  null,
  'a student cannot create a subject in another students period'
);

select public.select_current_academic_period(
  current_setting('phase13.period_one_id')::uuid
);
select is(
  (
    select current_academic_period_id
    from public.workspace_settings
    where user_id = auth.uid()
  ),
  current_setting('phase13.period_one_id')::uuid,
  'selecting a period lazily creates the current-period setting'
);
select public.select_current_academic_period(
  current_setting('phase13.period_two_id')::uuid
);
select is(
  (
    select count(*)::integer
    from public.workspace_settings
    where user_id = auth.uid()
  ),
  1,
  'a student has exactly one workspace settings row'
);
select public.archive_academic_period(
  current_setting('phase13.period_two_id')::uuid
);
select is(
  (
    select current_academic_period_id
    from public.workspace_settings
    where user_id = auth.uid()
  ),
  null::uuid,
  'archiving the current period clears its pointer'
);
select throws_ok(
  $$
    select public.select_current_academic_period(
      current_setting('phase13.period_two_id')::uuid
    )
  $$,
  '23514',
  null,
  'an archived period cannot be selected'
);
select public.restore_academic_period(
  current_setting('phase13.period_two_id')::uuid
);
select is(
  (
    select current_academic_period_id
    from public.workspace_settings
    where user_id = auth.uid()
  ),
  null::uuid,
  'restoring a period does not select it'
);

select set_config(
  'phase13.subject_one_id',
  (
    public.create_subject(
      current_setting('phase13.period_one_id')::uuid,
      'Biology'
    )
  ).id::text,
  true
);
select set_config(
  'phase13.subject_two_id',
  (
    public.create_subject(
      current_setting('phase13.period_one_id')::uuid,
      'Chemistry'
    )
  ).id::text,
  true
);
select throws_ok(
  $$
    select public.create_subject(
      current_setting('phase13.period_one_id')::uuid,
      U&'\00A0'
    )
  $$,
  '23514',
  null,
  'subject names containing only Unicode whitespace are rejected'
);
select set_config(
  'phase13.period_before_subject_update',
  (
    select updated_at::text
    from public.academic_periods
    where id = current_setting('phase13.period_one_id')::uuid
  ),
  true
);
select public.update_subject(
  current_setting('phase13.subject_one_id')::uuid,
  'Biology',
  null,
  null,
  null,
  null,
  null
);
select ok(
  (
    select updated_at > current_setting('phase13.period_before_subject_update')::timestamptz
    from public.academic_periods
    where id = current_setting('phase13.period_one_id')::uuid
  ),
  'subject edits refresh the parent period deletion-review timestamp'
);
select ok(
  (
    select is_active
    from public.subjects
    where id = current_setting('phase13.subject_one_id')::uuid
  ),
  'new subjects are active by default'
);
select public.archive_subject(
  current_setting('phase13.subject_two_id')::uuid
);
select ok(
  not (
    select is_active
    from public.subjects
    where id = current_setting('phase13.subject_two_id')::uuid
  ),
  'individual subject archive changes its own active state'
);
select public.archive_academic_period(
  current_setting('phase13.period_one_id')::uuid
);
select throws_ok(
  $$
    select public.create_subject(
      current_setting('phase13.period_one_id')::uuid,
      'Subject in archived period'
    )
  $$,
  '23514',
  null,
  'a subject cannot be created in an archived period'
);
select throws_ok(
  $$
    select public.archive_subject(
      current_setting('phase13.subject_one_id')::uuid
    )
  $$,
  '23514',
  null,
  'a subject cannot be archived separately when its period is archived'
);
select ok(
  (
    select is_active
    from public.subjects
    where id = current_setting('phase13.subject_one_id')::uuid
  ),
  'archiving a period does not update subject rows'
);
select throws_ok(
  $$
    select public.restore_subject(
      current_setting('phase13.subject_two_id')::uuid
    )
  $$,
  '23514',
  null,
  'a subject cannot be reactivated while its period is archived'
);
select public.restore_academic_period(
  current_setting('phase13.period_one_id')::uuid
);
select ok(
  (
    select is_active
    from public.subjects
    where id = current_setting('phase13.subject_one_id')::uuid
  )
  and not (
    select is_active
    from public.subjects
    where id = current_setting('phase13.subject_two_id')::uuid
  ),
  'restoring a period preserves each subjects individual archive state'
);
select public.restore_subject(
  current_setting('phase13.subject_two_id')::uuid
);
select ok(
  (
    select is_active
    from public.subjects
    where id = current_setting('phase13.subject_two_id')::uuid
  ),
  'restoring an individual subject reactivates it'
);
select throws_ok(
  $$
    select public.permanently_delete_archived_subject(
      current_setting('phase13.subject_two_id')::uuid,
      now()
    )
  $$,
  '23514',
  null,
  'an active subject cannot be permanently deleted'
);
select set_config(
  'phase13.subject_two_updated_at',
  (
    select updated_at::text
    from public.subjects
    where id = current_setting('phase13.subject_two_id')::uuid
  ),
  true
);
select public.archive_subject(
  current_setting('phase13.subject_two_id')::uuid
);
select is(
  public.permanently_delete_archived_subject(
    current_setting('phase13.subject_two_id')::uuid,
    current_setting('phase13.subject_two_updated_at')::timestamptz
  ) ->> 'status',
  'review_required',
  'subject changes require a fresh deletion review'
);
select is(
  public.permanently_delete_archived_subject(
    current_setting('phase13.subject_two_id')::uuid,
    (
      select updated_at
      from public.subjects
      where id = current_setting('phase13.subject_two_id')::uuid
    )
  ) ->> 'status',
  'deleted',
  'an archived subject can be permanently deleted after review'
);

select public.archive_academic_period(
  current_setting('phase13.period_one_id')::uuid
);
select set_config(
  'phase13.period_one_updated_at',
  (
    select updated_at::text
    from public.academic_periods
    where id = current_setting('phase13.period_one_id')::uuid
  ),
  true
);
select is(
  public.permanently_delete_archived_period(
    current_setting('phase13.period_one_id')::uuid,
    0,
    current_setting('phase13.period_one_updated_at')::timestamptz
  ) ->> 'status',
  'review_required',
  'changed period deletion counts require a fresh review'
);
select is(
  (
    select count(*)::integer
    from public.academic_periods
    where id = current_setting('phase13.period_one_id')::uuid
  ),
  1,
  'a changed deletion summary does not delete the period'
);
select is(
  public.permanently_delete_archived_period(
    current_setting('phase13.period_one_id')::uuid,
    1,
    current_setting('phase13.period_one_updated_at')::timestamptz
  ) ->> 'status',
  'deleted',
  'an archived period can be permanently deleted after review'
);
select is(
  (
    select count(*)::integer
    from public.subjects
    where academic_period_id = current_setting('phase13.period_one_id')::uuid
  ),
  0,
  'permanently deleting a period deletes its subjects'
);
select is(
  public.delete_academic_year(
    current_setting('phase13.year_id')::uuid,
    1,
    current_setting('phase13.year_updated_at')::timestamptz
  ) ->> 'status',
  'blocked',
  'an academic year with periods cannot be deleted'
);
select public.archive_academic_period(
  current_setting('phase13.period_two_id')::uuid
);
select set_config(
  'phase13.period_two_updated_at',
  (
    select updated_at::text
    from public.academic_periods
    where id = current_setting('phase13.period_two_id')::uuid
  ),
  true
);
select is(
  public.permanently_delete_archived_period(
    current_setting('phase13.period_two_id')::uuid,
    0,
    current_setting('phase13.period_two_updated_at')::timestamptz
  ) ->> 'status',
  'deleted',
  'an empty archived period can be permanently deleted'
);
select is(
  public.delete_academic_year(
    current_setting('phase13.year_id')::uuid,
    1,
    current_setting('phase13.year_updated_at')::timestamptz
  ) ->> 'status',
  'review_required',
  'a changed academic year summary requires a fresh review'
);
select is(
  public.delete_academic_year(
    current_setting('phase13.year_id')::uuid,
    0,
    current_setting('phase13.year_updated_at')::timestamptz
  ) ->> 'status',
  'deleted',
  'an empty academic year can be permanently deleted'
);

reset role;
select lives_ok(
  $$delete from auth.users where id = '11111111-1111-4111-8111-111111111111'$$,
  'deleting an auth user is not blocked by the current-period foreign key'
);
select is(
  (
    select count(*)::integer
    from public.workspace_settings
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  0,
  'auth user deletion removes workspace settings before period cascades'
);
select is(
  (
    select count(*)::integer
    from public.academic_years
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  0,
  'auth user deletion cascades academic years'
);
select is(
  (
    select count(*)::integer
    from public.academic_years
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  1,
  'another students academic year remains unchanged'
);

select * from finish();
rollback;
