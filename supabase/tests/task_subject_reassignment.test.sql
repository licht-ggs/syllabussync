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
    '14141414-1414-4141-8141-141414141414',
    'task-reassignment-owner@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  ),
  (
    '24242424-2424-4242-8242-242424242424',
    'task-reassignment-other@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  );

insert into public.academic_years (id, user_id, name)
values
  (
    '33333333-3333-4333-8333-333333333333',
    '14141414-1414-4141-8141-141414141414',
    'Task reassignment owner year'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '24242424-2424-4242-8242-242424242424',
    'Task reassignment other year'
  );

insert into public.academic_periods (id, user_id, academic_year_id, name)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '14141414-1414-4141-8141-141414141414',
    '33333333-3333-4333-8333-333333333333',
    'Task reassignment source period'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '14141414-1414-4141-8141-141414141414',
    '33333333-3333-4333-8333-333333333333',
    'Task reassignment destination period'
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    '14141414-1414-4141-8141-141414141414',
    '33333333-3333-4333-8333-333333333333',
    'Task reassignment archived period'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    '24242424-2424-4242-8242-242424242424',
    '44444444-4444-4444-8444-444444444444',
    'Task reassignment other period'
  );

insert into public.subjects (
  id,
  user_id,
  academic_period_id,
  name,
  is_active
)
values
  (
    '99999999-9999-4999-8999-999999999999',
    '14141414-1414-4141-8141-141414141414',
    '55555555-5555-4555-8555-555555555555',
    'Task reassignment source subject',
    true
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '14141414-1414-4141-8141-141414141414',
    '66666666-6666-4666-8666-666666666666',
    'Task reassignment active destination',
    true
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '14141414-1414-4141-8141-141414141414',
    '66666666-6666-4666-8666-666666666666',
    'Task reassignment inactive destination',
    false
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '14141414-1414-4141-8141-141414141414',
    '66666666-6666-4666-8666-666666666666',
    'Task reassignment archived subject',
    true
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '14141414-1414-4141-8141-141414141414',
    '77777777-7777-4777-8777-777777777777',
    'Task reassignment archived-period subject',
    true
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '24242424-2424-4242-8242-242424242424',
    '88888888-8888-4888-8888-888888888888',
    'Task reassignment other-owner subject',
    true
  );

insert into public.tasks (
  id,
  user_id,
  subject_id,
  title,
  description,
  task_type,
  due_date,
  priority
)
values
  (
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    '14141414-1414-4141-8141-141414141414',
    '99999999-9999-4999-8999-999999999999',
    'Reassignment rollback task',
    'Task fields are retained during a subject move.',
    'Assignment',
    '2026-12-01',
    'Normal'
  ),
  (
    '12121212-1212-4212-8212-121212121212',
    '14141414-1414-4141-8141-141414141414',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Task under archived subject',
    'Existing task remains editable.',
    'Project',
    '2026-12-02',
    'High'
  ),
  (
    '13131313-1313-4313-8313-131313131313',
    '14141414-1414-4141-8141-141414141414',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Task under archived period',
    'Existing task remains editable.',
    'Quiz',
    '2026-12-03',
    'Low'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"14141414-1414-4141-8141-141414141414","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '14141414-1414-4141-8141-141414141414',
  true
);

select is(
  public.update_task(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    1,
    'Reassignment rollback task',
    'Task fields are retained during a subject move.',
    'Assignment',
    null,
    '2026-12-01',
    null,
    null,
    null,
    'Normal',
    'Not Started',
    null,
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'status',
  'updated',
  'an owner can reassign a task to an active subject in another period'
);
select is(
  (
    select subject_id
    from public.tasks
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'successful reassignment changes the task subject'
);
select is(
  (
    select old_values
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
      and event_type = 'subject_reassigned'
  ),
  '{"subject_id":"99999999-9999-4999-8999-999999999999"}'::jsonb,
  'subject history records the old subject ID'
);
select is(
  (
    select new_values
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
      and event_type = 'subject_reassigned'
  ),
  '{"subject_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb,
  'subject history records the new subject ID'
);
select is(
  (
    select row(title, description, due_date, priority, status, version)
    from public.tasks
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  row(
    'Reassignment rollback task'::text,
    'Task fields are retained during a subject move.'::text,
    '2026-12-01'::date,
    'Normal'::text,
    'Not Started'::text,
    2
  ),
  'reassignment preserves other task fields and advances its version'
);

select is(
  public.update_task(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    1,
    'Stale reassignment',
    'Task fields are retained during a subject move.',
    'Assignment',
    null,
    '2026-12-01',
    null,
    null,
    null,
    'Normal',
    'Not Started',
    null,
    null,
    '99999999-9999-4999-8999-999999999999'
  )->>'status',
  'review_required',
  'a stale version cannot reassign a task'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  1,
  'a stale reassignment creates no history'
);
select is(
  (
    select subject_id
    from public.tasks
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'a stale reassignment leaves the task subject unchanged'
);

select throws_ok(
  $$
    select public.update_task(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      2,
      'Cross-owner reassignment',
      'Task fields are retained during a subject move.',
      'Assignment',
      null,
      '2026-12-01',
      null,
      null,
      null,
      'Normal',
      'Not Started',
      null,
      null,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    )
  $$,
  'P0002',
  'Subject not found',
  'a task cannot be reassigned to another student’s subject'
);
select is(
  (
    select subject_id
    from public.tasks
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'cross-owner rejection preserves the task subject'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  1,
  'cross-owner rejection preserves history'
);

select throws_ok(
  $$
    select public.update_task(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      2,
      'Inactive reassignment',
      'Task fields are retained during a subject move.',
      'Assignment',
      null,
      '2026-12-01',
      null,
      null,
      null,
      'Normal',
      'Not Started',
      null,
      null,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
  $$,
  '23514',
  'Tasks cannot be reassigned to an archived parent',
  'a task cannot be reassigned to an inactive subject'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  1,
  'inactive-destination rejection preserves history'
);

select public.archive_subject('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select throws_ok(
  $$
    select public.update_task(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      2,
      'Archived-subject reassignment',
      'Task fields are retained during a subject move.',
      'Assignment',
      null,
      '2026-12-01',
      null,
      null,
      null,
      'Normal',
      'Not Started',
      null,
      null,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    )
  $$,
  '23514',
  'Tasks cannot be reassigned to an archived parent',
  'a task cannot be reassigned to an archived subject'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  1,
  'archived-subject rejection preserves history'
);

select public.archive_academic_period(
  '77777777-7777-4777-8777-777777777777'
);
select throws_ok(
  $$
    select public.update_task(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      2,
      'Archived-period reassignment',
      'Task fields are retained during a subject move.',
      'Assignment',
      null,
      '2026-12-01',
      null,
      null,
      null,
      'Normal',
      'Not Started',
      null,
      null,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    )
  $$,
  '23514',
  'Tasks cannot be reassigned to an archived parent',
  'a task cannot be reassigned to an archived period'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  1,
  'archived-period rejection preserves history'
);

select is(
  public.update_task(
    '12121212-1212-4212-8212-121212121212',
    1,
    'Edited under archived subject',
    'Existing task remains editable.',
    'Project',
    null,
    '2026-12-02',
    null,
    null,
    null,
    'High',
    'In Progress',
    null,
    null,
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  )->>'status',
  'updated',
  'an existing task remains editable under its archived subject'
);
select is(
  public.update_task(
    '13131313-1313-4313-8313-131313131313',
    1,
    'Edited under archived period',
    'Existing task remains editable.',
    'Quiz',
    null,
    '2026-12-03',
    null,
    null,
    null,
    'Low',
    'In Progress',
    null,
    null,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  )->>'status',
  'updated',
  'an existing task remains editable under its archived period'
);

reset role;
create function public.reject_subject_reassignment_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_type = 'subject_reassigned' then
    raise exception 'test subject history failure' using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.reject_subject_reassignment_history()
  from public, anon, authenticated;
create trigger reject_subject_reassignment_history
  before insert on public.task_history
  for each row execute function public.reject_subject_reassignment_history();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"14141414-1414-4141-8141-141414141414","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '14141414-1414-4141-8141-141414141414',
  true
);
select throws_ok(
  $$
    select public.update_task(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      2,
      'Reassignment rollback task',
      'Task fields are retained during a subject move.',
      'Assignment',
      null,
      '2026-12-02',
      null,
      null,
      null,
      'Normal',
      'In Progress',
      null,
      null,
      '99999999-9999-4999-8999-999999999999'
    )
  $$,
  '23514',
  'test subject history failure',
  'a subject-history insertion failure aborts all task changes'
);
select is(
  (
    select row(subject_id, title, due_date, status, version)
    from public.tasks
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  row(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'Reassignment rollback task'::text,
    '2026-12-01'::date,
    'Not Started'::text,
    2
  ),
  'a rejected reassignment preserves subject and all other task fields'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  1,
  'a rejected reassignment rolls back preceding history inserts'
);

reset role;
drop trigger reject_subject_reassignment_history on public.task_history;
drop function public.reject_subject_reassignment_history();

select * from finish();
rollback;
