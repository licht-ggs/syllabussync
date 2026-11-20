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
    'phase14-owner@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  ),
  (
    '24242424-2424-4242-8242-242424242424',
    'phase14-other@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  );

insert into public.academic_years (id, user_id, name)
values
  (
    '33333333-3333-4333-8333-333333333333',
    '14141414-1414-4141-8141-141414141414',
    'Phase 1.4 owner year'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '24242424-2424-4242-8242-242424242424',
    'Phase 1.4 other year'
  );

insert into public.academic_periods (id, user_id, academic_year_id, name)
values
  (
    '44444444-4444-4444-8444-444444444444',
    '14141414-1414-4141-8141-141414141414',
    '33333333-3333-4333-8333-333333333333',
    'Phase 1.4 owner period one'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '14141414-1414-4141-8141-141414141414',
    '33333333-3333-4333-8333-333333333333',
    'Phase 1.4 owner period two'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '14141414-1414-4141-8141-141414141414',
    '33333333-3333-4333-8333-333333333333',
    'Phase 1.4 owner period three'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '24242424-2424-4242-8242-242424242424',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Phase 1.4 other period'
  );

insert into public.subjects (id, user_id, academic_period_id, name)
values
  (
    '77777777-7777-4777-8777-777777777777',
    '14141414-1414-4141-8141-141414141414',
    '44444444-4444-4444-8444-444444444444',
    'Phase 1.4 owner subject one'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    '14141414-1414-4141-8141-141414141414',
    '55555555-5555-4555-8555-555555555555',
    'Phase 1.4 owner subject two'
  ),
  (
    '99999999-9999-4999-8999-999999999999',
    '14141414-1414-4141-8141-141414141414',
    '66666666-6666-4666-8666-666666666666',
    'Phase 1.4 owner subject three'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '24242424-2424-4242-8242-242424242424',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Phase 1.4 other subject'
  );

insert into public.tasks (
  id,
  user_id,
  subject_id,
  title,
  task_type,
  due_date,
  priority
)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '24242424-2424-4242-8242-242424242424',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Other student task',
  'Assignment',
  '2026-12-01',
  'Normal'
);

insert into public.task_history (
  task_id,
  user_id,
  event_type,
  old_values,
  new_values
)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '24242424-2424-4242-8242-242424242424',
  'status_changed',
  '{"status":"Not Started"}',
  '{"status":"In Progress"}'
);

select has_table('public', 'tasks', 'the tasks table exists');
select has_table('public', 'task_history', 'the task history table exists');
select has_column(
  'public',
  'workspace_settings',
  'preferred_timezone',
  'workspace settings contain a preferred timezone'
);
select ok(
  has_table_privilege('authenticated', 'public.tasks', 'SELECT')
  and has_table_privilege('authenticated', 'public.task_history', 'SELECT'),
  'authenticated users can read task and history rows subject to RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.tasks', 'INSERT')
  and not has_table_privilege('authenticated', 'public.tasks', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.tasks', 'DELETE')
  and not has_table_privilege('authenticated', 'public.task_history', 'INSERT')
  and not has_table_privilege('authenticated', 'public.task_history', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.task_history', 'DELETE')
  and not has_table_privilege(
    'authenticated',
    'public.workspace_settings',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.workspace_settings',
    'UPDATE'
  ),
  'authenticated users cannot directly mutate tasks, history, or settings'
);
select ok(
  not has_table_privilege('anon', 'public.tasks', 'SELECT')
  and not has_table_privilege('anon', 'public.task_history', 'SELECT'),
  'anonymous users cannot read task or history data'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_preferred_timezone(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.create_task(uuid,text,text,text,text,date,time,text,timestamp with time zone,text,integer,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.update_task(uuid,integer,text,text,text,text,date,time,text,timestamp with time zone,text,text,integer,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.delete_task(uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.permanently_delete_archived_subject(uuid,timestamp with time zone)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.permanently_delete_archived_period(uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated users can execute approved task mutation functions'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_task(uuid,text,text,text,text,date,time,text,timestamp with time zone,text,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_task(uuid,integer,text,text,text,text,date,time,text,timestamp with time zone,text,text,integer,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.permanently_delete_archived_subject(uuid,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.permanently_delete_archived_period(uuid,integer,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.is_valid_iana_timezone(text)',
    'EXECUTE'
  ),
  'anonymous and helper-function execution are not granted'
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

select public.select_current_academic_period(
  '44444444-4444-4444-8444-444444444444'
);
select is(
  (
    public.set_preferred_timezone('Asia/Tokyo')
  ).current_academic_period_id,
  '44444444-4444-4444-8444-444444444444'::uuid,
  'changing timezone preserves the selected current period'
);
select is(
  (
    public.set_preferred_timezone('Asia/Tokyo')
  ).preferred_timezone,
  'Asia/Tokyo',
  'a supported IANA timezone is saved'
);
select throws_ok(
  $$select public.set_preferred_timezone('Not/A_Real_Zone')$$,
  '22023',
  null,
  'unsupported timezone identifiers are rejected'
);

select set_config(
  'phase14.task_id',
  (
    public.create_task(
      '77777777-7777-4777-8777-777777777777',
      'Overdue assignment',
      null,
      'Assignment',
      null,
      '2000-01-01',
      null,
      null,
      null,
      'Normal',
      null,
      null
    )->'task'->>'id'
  ),
  true
);
select is(
  (
    select status
    from public.tasks
    where id = current_setting('phase14.task_id')::uuid
  ),
  'Not Started',
  'overdue dates do not automatically change student-controlled status'
);
select is(
  (
    select version
    from public.tasks
    where id = current_setting('phase14.task_id')::uuid
  ),
  1,
  'task version starts at one'
);
select is(
  (
    select count(*)::integer
    from public.tasks
  ),
  1,
  'task RLS exposes only the authenticated owner’s task'
);
select is(
  (
    select count(*)::integer
    from public.task_history
  ),
  0,
  'task-history RLS hides another student’s history'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24242424-2424-4242-8242-242424242424","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '24242424-2424-4242-8242-242424242424',
  true
);
select is(
  (
    public.set_preferred_timezone('Asia/Manila')
  ).current_academic_period_id,
  null::uuid,
  'timezone settings can be created without selecting a current period'
);
select is(
  (
    select count(*)::integer
    from public.workspace_settings
    where user_id = auth.uid()
  ),
  1,
  'timezone preference creates one settings row for a user without one'
);
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
    select public.create_task(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'Cross-owner task',
      null,
      'Assignment',
      null,
      '2026-12-01',
      null,
      null,
      null,
      'Normal',
      null,
      null
    )
  $$,
  '23503',
  null,
  'a task cannot be attached to another student’s subject'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority
    )
    values (
      auth.uid(),
      '77777777-7777-4777-8777-777777777777',
      'Direct task write',
      'Assignment',
      '2026-12-01',
      'Normal'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot insert tasks directly'
);

select public.update_task(
  current_setting('phase14.task_id')::uuid,
  1,
  'Overdue assignment',
  null,
  'Assignment',
  null,
  '2000-01-01',
  null,
  null,
  null,
  'Normal',
  'In Progress',
  null,
  null
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.task_id')::uuid
      and event_type = 'status_changed'
      and old_values = '{"status":"Not Started"}'::jsonb
      and new_values = '{"status":"In Progress"}'::jsonb
  ),
  1,
  'a status update records one status history event'
);
select public.update_task(
  current_setting('phase14.task_id')::uuid,
  2,
  'Overdue assignment',
  null,
  'Assignment',
  null,
  '2000-01-02',
  null,
  null,
  null,
  'Normal',
  'Completed',
  null,
  null
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.task_id')::uuid
  ),
  3,
  'status and deadline changes create one event per changed category'
);
select is(
  (
    select old_values->>'due_date'
    from public.task_history
    where task_id = current_setting('phase14.task_id')::uuid
      and event_type = 'deadline_changed'
  ),
  '2000-01-01',
  'deadline history records the previous due date'
);
select is(
  public.update_task(
    current_setting('phase14.task_id')::uuid,
    1,
    'Stale update',
    null,
    'Assignment',
    null,
    '2000-01-02',
    null,
    null,
    null,
    'Normal',
    'Completed',
    null,
    null
  )->>'status',
  'review_required',
  'a stale task version requires review instead of overwriting newer values'
);
select set_config(
  'phase14.task_before_null_update',
  (
    select to_jsonb(task)::text
    from public.tasks as task
    where task.id = current_setting('phase14.task_id')::uuid
  ),
  true
);
select is(
  public.update_task(
    current_setting('phase14.task_id')::uuid,
    null::integer,
    'Null version must not update',
    null,
    'Assignment',
    null,
    '2000-01-03',
    null,
    null,
    null,
    'High',
    'Not Started',
    null,
    null
  )->>'status',
  'review_required',
  'a NULL expected version is rejected as a task conflict'
);
select is(
  (
    select to_jsonb(task)::text
    from public.tasks as task
    where task.id = current_setting('phase14.task_id')::uuid
  ),
  current_setting('phase14.task_before_null_update'),
  'a rejected NULL-version update leaves the entire task unchanged'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.task_id')::uuid
  ),
  3,
  'a rejected NULL-version update inserts no history event'
);

select throws_ok(
  $$
    update public.task_history
    set new_values = '{"status":"Not Started"}'
    where task_id = current_setting('phase14.task_id')::uuid
  $$,
  '42501',
  null,
  'authenticated users cannot update task history directly'
);
select throws_ok(
  $$
    delete from public.task_history
    where task_id = current_setting('phase14.task_id')::uuid
  $$,
  '42501',
  null,
  'authenticated users cannot delete task history directly'
);
select throws_ok(
  $$
    insert into public.task_history (
      task_id, user_id, event_type, old_values, new_values
    )
    values (
      current_setting('phase14.task_id')::uuid,
      auth.uid(),
      'status_changed',
      '{"status":"Completed"}',
      '{"status":"Not Started"}'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot insert task history directly'
);

reset role;

select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Invalid task type',
      'Essay',
      '2026-12-01',
      'Normal'
    )
  $$,
  '23514',
  null,
  'unapproved task types are rejected'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Invalid priority',
      'Assignment',
      '2026-12-01',
      'Critical'
    )
  $$,
  '23514',
  null,
  'unapproved priority values are rejected'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority, status
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Invalid status',
      'Assignment',
      '2026-12-01',
      'Normal',
      'Overdue'
    )
  $$,
  '23514',
  null,
  'unapproved task statuses are rejected'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Other without custom type',
      'Other',
      '2026-12-01',
      'Normal'
    )
  $$,
  '23514',
  null,
  'Other requires a non-empty custom type'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, custom_type, due_date, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Assignment with custom type',
      'Assignment',
      'Essay',
      '2026-12-01',
      'Normal'
    )
  $$,
  '23514',
  null,
  'non-Other task types cannot have a custom type'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Missing due date',
      'Assignment',
      'Normal'
    )
  $$,
  '23502',
  null,
  'due date is required'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority,
      estimated_duration_minutes
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Zero duration',
      'Assignment',
      '2026-12-01',
      'Normal',
      0
    )
  $$,
  '23514',
  null,
  'estimated duration must be positive when supplied'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority,
      due_time, due_timezone
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Timed task without resolved instant',
      'Assignment',
      '2026-12-01',
      'Normal',
      '09:00',
      'Asia/Manila'
    )
  $$,
  '22023',
  null,
  'timed deadlines require an explicit resolved instant'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, priority,
      due_timezone
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'All-day with timezone',
      'Assignment',
      '2026-12-01',
      'Normal',
      'Asia/Manila'
    )
  $$,
  '23514',
  null,
  'all-day deadlines cannot contain timed fields'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, due_time,
      due_timezone, due_at, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Invalid timezone',
      'Assignment',
      '2026-12-01',
      '09:00',
      'Not/A_Real_Zone',
      '2026-12-01 01:00+00',
      'Normal'
    )
  $$,
  '22023',
  null,
  'timed deadlines require a supported IANA timezone'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, due_time,
      due_timezone, due_at, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Mismatched instant',
      'Assignment',
      '2026-12-01',
      '09:00',
      'Asia/Manila',
      '2026-12-01 09:00+00',
      'Normal'
    )
  $$,
  '23514',
  null,
  'the stored instant must round-trip to the original local deadline'
);
select throws_ok(
  $$
    insert into public.tasks (
      user_id, subject_id, title, task_type, due_date, due_time,
      due_timezone, due_at, priority
    )
    values (
      '14141414-1414-4141-8141-141414141414',
      '77777777-7777-4777-8777-777777777777',
      'Nonexistent spring-forward time',
      'Assignment',
      '2026-03-08',
      '02:30',
      'America/New_York',
      '2026-03-08 07:30+00',
      'Normal'
    )
  $$,
  '23514',
  null,
  'a nonexistent daylight-saving local time is rejected'
);

with inserted as (
  insert into public.tasks (
    user_id,
    subject_id,
    title,
    task_type,
    due_date,
    due_time,
    due_timezone,
    due_at,
    priority
  )
  values (
    '14141414-1414-4141-8141-141414141414',
    '77777777-7777-4777-8777-777777777777',
    'Repeated fall-back time',
    'Quiz',
    '2026-11-01',
    '01:30',
    'America/New_York',
    '2026-11-01 06:30+00',
    'High'
  )
  returning id, due_at
)
select set_config('phase14.fold_task_id', id::text, true)
from inserted;
select is(
  (
    select due_at
    from public.tasks
    where id = current_setting('phase14.fold_task_id')::uuid
  ),
  '2026-11-01 06:30+00'::timestamptz,
  'a repeated local time preserves the explicitly supplied occurrence'
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

select set_config(
  'phase14.subject_two_task_id',
  (
    public.create_task(
      '88888888-8888-4888-8888-888888888888',
      'Task under subject to archive',
      null,
      'Project',
      null,
      '2026-12-10',
      null,
      null,
      null,
      'High',
      30,
      null
    )->'task'->>'id'
  ),
  true
);
select set_config(
  'phase14.other_task_id',
  (
    public.create_task(
      '77777777-7777-4777-8777-777777777777',
      'Custom task type',
      null,
      'Other',
      'Research',
      '2026-12-15',
      null,
      null,
      null,
      'Low',
      null,
      null
    )->'task'->>'id'
  ),
  true
);
select is(
  (
    select custom_type
    from public.tasks
    where id = current_setting('phase14.other_task_id')::uuid
  ),
  'Research',
  'Other accepts a supplied custom task type'
);

select public.archive_subject('88888888-8888-4888-8888-888888888888');
select is(
  (
    select status
    from public.tasks
    where id = current_setting('phase14.subject_two_task_id')::uuid
  ),
  'Not Started',
  'archiving a subject does not alter existing task status'
);
select throws_ok(
  $$
    select public.create_task(
      '88888888-8888-4888-8888-888888888888',
      'New task under archived subject',
      null,
      'Assignment',
      null,
      '2026-12-11',
      null,
      null,
      null,
      'Normal',
      null,
      null
    )
  $$,
  '23514',
  null,
  'tasks cannot be created under an archived subject'
);
select public.update_task(
  current_setting('phase14.subject_two_task_id')::uuid,
  1,
  'Task under subject to archive',
  null,
  'Project',
  null,
  '2026-12-10',
  null,
  null,
  null,
  'High',
  'In Progress',
  30,
  null
);
select is(
  (
    select status
    from public.tasks
    where id = current_setting('phase14.subject_two_task_id')::uuid
  ),
  'In Progress',
  'existing tasks remain manageable under an archived subject'
);
select public.restore_subject('88888888-8888-4888-8888-888888888888');

select public.select_current_academic_period(
  '55555555-5555-4555-8555-555555555555'
);
select public.archive_academic_period(
  '55555555-5555-4555-8555-555555555555'
);
select is(
  (
    select current_academic_period_id
    from public.workspace_settings
    where user_id = auth.uid()
  ),
  null::uuid,
  'archiving the selected period clears its current-period pointer'
);
select throws_ok(
  $$
    select public.create_task(
      '88888888-8888-4888-8888-888888888888',
      'New task under archived period',
      null,
      'Assignment',
      null,
      '2026-12-12',
      null,
      null,
      null,
      'Normal',
      null,
      null
    )
  $$,
  '23514',
  null,
  'tasks cannot be created under an archived period'
);
select public.update_task(
  current_setting('phase14.subject_two_task_id')::uuid,
  2,
  'Task under subject to archive',
  null,
  'Project',
  null,
  '2026-12-10',
  null,
  null,
  null,
  'High',
  'Completed',
  30,
  null
);
select is(
  (
    select status
    from public.tasks
    where id = current_setting('phase14.subject_two_task_id')::uuid
  ),
  'Completed',
  'existing tasks remain manageable under an archived period'
);
select public.restore_academic_period(
  '55555555-5555-4555-8555-555555555555'
);

select public.archive_subject('88888888-8888-4888-8888-888888888888');
select set_config(
  'phase14.subject_two_updated_at',
  (
    select updated_at::text
    from public.subjects
    where id = '88888888-8888-4888-8888-888888888888'
  ),
  true
);
select public.update_task(
  current_setting('phase14.subject_two_task_id')::uuid,
  3,
  'Task under subject to archive',
  null,
  'Project',
  null,
  '2026-12-11',
  null,
  null,
  null,
  'High',
  'Completed',
  30,
  null
);
select is(
  public.permanently_delete_archived_subject(
    '88888888-8888-4888-8888-888888888888',
    current_setting('phase14.subject_two_updated_at')::timestamptz
  )->>'status',
  'review_required',
  'task changes invalidate a previously reviewed subject summary'
);
select is(
  public.permanently_delete_archived_subject(
    '88888888-8888-4888-8888-888888888888',
    (
      select updated_at
      from public.subjects
      where id = '88888888-8888-4888-8888-888888888888'
    )
  )->>'status',
  'deleted',
  'an archived subject deletion removes tasks and history'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.subject_two_task_id')::uuid
  ),
  0,
  'archived subject deletion removes its task history'
);

reset role;

create function public.phase14_reject_history_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'test history failure' using errcode = '23514';
end;
$$;
revoke all on function public.phase14_reject_history_insert() from public, anon, authenticated;
create trigger phase14_reject_history_insert
  before insert on public.task_history
  for each row execute function public.phase14_reject_history_insert();

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
      current_setting('phase14.task_id')::uuid,
      3,
      'Overdue assignment',
      null,
      'Assignment',
      null,
      '2000-01-02',
      null,
      null,
      null,
      'Normal',
      'In Progress',
      null,
      null
    )
  $$,
  '23514',
  'test history failure',
  'a history insertion failure aborts the task update'
);
select is(
  (
    select status
    from public.tasks
    where id = current_setting('phase14.task_id')::uuid
  ),
  'Completed',
  'a failed history write leaves the task unchanged'
);
select is(
  (
    select version
    from public.tasks
    where id = current_setting('phase14.task_id')::uuid
  ),
  3,
  'a failed history write does not advance the task version'
);

reset role;
drop trigger phase14_reject_history_insert on public.task_history;
drop function public.phase14_reject_history_insert();

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
select set_config(
  'phase14.task_before_null_delete',
  (
    select to_jsonb(task)::text
    from public.tasks as task
    where task.id = current_setting('phase14.task_id')::uuid
  ),
  true
);
select is(
  public.delete_task(
    current_setting('phase14.task_id')::uuid,
    null::integer
  )->>'status',
  'review_required',
  'a NULL expected version is rejected for task deletion'
);
select is(
  (
    select count(*)::integer
    from public.tasks
    where id = current_setting('phase14.task_id')::uuid
  ),
  1,
  'a rejected NULL-version deletion preserves the task'
);
select is(
  (
    select to_jsonb(task)::text
    from public.tasks as task
    where task.id = current_setting('phase14.task_id')::uuid
  ),
  current_setting('phase14.task_before_null_delete'),
  'a rejected NULL-version deletion leaves the task unchanged'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.task_id')::uuid
  ),
  3,
  'a rejected NULL-version deletion preserves task history'
);
select is(
  public.delete_task(
    current_setting('phase14.task_id')::uuid,
    3
  )->>'status',
  'deleted',
  'task deletion succeeds with the current version'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.task_id')::uuid
  ),
  0,
  'permanent task deletion cascades its history'
);

select set_config(
  'phase14.period_three_task_id',
  (
    public.create_task(
      '99999999-9999-4999-8999-999999999999',
      'Task under period to delete',
      null,
      'Practical Exam',
      null,
      '2026-12-20',
      null,
      null,
      null,
      'Urgent',
      null,
      null
    )->'task'->>'id'
  ),
  true
);
select public.update_task(
  current_setting('phase14.period_three_task_id')::uuid,
  1,
  'Task under period to delete',
  null,
  'Practical Exam',
  null,
  '2026-12-21',
  null,
  null,
  null,
  'Urgent',
  'In Progress',
  null,
  null
);
select public.select_current_academic_period(
  '66666666-6666-4666-8666-666666666666'
);
select public.archive_academic_period(
  '66666666-6666-4666-8666-666666666666'
);
select set_config(
  'phase14.period_three_updated_at',
  (
    select updated_at::text
    from public.academic_periods
    where id = '66666666-6666-4666-8666-666666666666'
  ),
  true
);
select public.update_task(
  current_setting('phase14.period_three_task_id')::uuid,
  2,
  'Task under period to delete',
  null,
  'Practical Exam',
  null,
  '2026-12-21',
  null,
  null,
  null,
  'Urgent',
  'Completed',
  null,
  null
);
select is(
  public.permanently_delete_archived_period(
    '66666666-6666-4666-8666-666666666666',
    1,
    current_setting('phase14.period_three_updated_at')::timestamptz
  )->>'status',
  'review_required',
  'task changes invalidate a previously reviewed period summary'
);
select is(
  public.permanently_delete_archived_period(
    '66666666-6666-4666-8666-666666666666',
    null::integer,
    (
      select updated_at
      from public.academic_periods
      where id = '66666666-6666-4666-8666-666666666666'
    )
  )->>'status',
  'review_required',
  'a NULL expected subject count is rejected for period deletion'
);
select is(
  (
    select count(*)::integer
    from public.academic_periods
    where id = '66666666-6666-4666-8666-666666666666'
  ),
  1,
  'a rejected NULL-count deletion preserves the period'
);
select is(
  (
    select count(*)::integer
    from public.subjects
    where id = '99999999-9999-4999-8999-999999999999'
  ),
  1,
  'a rejected NULL-count deletion preserves its subject'
);
select is(
  (
    select count(*)::integer
    from public.tasks
    where id = current_setting('phase14.period_three_task_id')::uuid
  ),
  1,
  'a rejected NULL-count deletion preserves its task'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.period_three_task_id')::uuid
  ),
  3,
  'a rejected NULL-count deletion preserves its task history'
);

reset role;
create function public.phase14_reject_subject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id = '99999999-9999-4999-8999-999999999999'::uuid then
    raise exception 'test subject deletion failure' using errcode = '23514';
  end if;
  return old;
end;
$$;
revoke all on function public.phase14_reject_subject_delete() from public, anon, authenticated;
create trigger phase14_reject_subject_delete
  before delete on public.subjects
  for each row execute function public.phase14_reject_subject_delete();

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
    select public.permanently_delete_archived_period(
      '66666666-6666-4666-8666-666666666666',
      1,
      (
        select updated_at
        from public.academic_periods
        where id = '66666666-6666-4666-8666-666666666666'
      )
    )
  $$,
  '23514',
  'test subject deletion failure',
  'a subject deletion failure aborts the period deletion'
);
select is(
  (
    select count(*)::integer
    from public.tasks
    where id = current_setting('phase14.period_three_task_id')::uuid
  ),
  1,
  'failed period deletion rolls back task removal'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.period_three_task_id')::uuid
  ),
  3,
  'failed period deletion rolls back history removal'
);

reset role;
drop trigger phase14_reject_subject_delete on public.subjects;
drop function public.phase14_reject_subject_delete();

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
  public.permanently_delete_archived_period(
    '66666666-6666-4666-8666-666666666666',
    1,
    (
      select updated_at
      from public.academic_periods
      where id = '66666666-6666-4666-8666-666666666666'
    )
  )->>'status',
  'deleted',
  'an archived period deletion removes its tasks and descendants'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where task_id = current_setting('phase14.period_three_task_id')::uuid
  ),
  0,
  'period deletion removes task history through task deletion'
);

reset role;
select lives_ok(
  $$delete from auth.users where id = '24242424-2424-4242-8242-242424242424'$$,
  'account deletion remains functional with task foreign keys'
);
select is(
  (
    select count(*)::integer
    from public.tasks
    where user_id = '24242424-2424-4242-8242-242424242424'
  ),
  0,
  'account deletion removes owned tasks'
);
select is(
  (
    select count(*)::integer
    from public.task_history
    where user_id = '24242424-2424-4242-8242-242424242424'
  ),
  0,
  'account deletion removes owned task history'
);
select is(
  (
    select count(*)::integer
    from public.workspace_settings
    where user_id = '24242424-2424-4242-8242-242424242424'
  ),
  0,
  'account deletion removes timezone settings'
);

select * from finish();
rollback;
