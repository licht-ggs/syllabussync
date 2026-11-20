alter table public.workspace_settings
  add column preferred_timezone text not null default 'Asia/Manila';

create function public.is_valid_iana_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names as timezone
    where timezone.name = p_timezone
  )
$$;

create function public.validate_workspace_preferred_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_valid_iana_timezone(new.preferred_timezone) then
    raise exception 'Unsupported IANA timezone'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger workspace_settings_validate_preferred_timezone
  before insert or update of preferred_timezone on public.workspace_settings
  for each row execute function public.validate_workspace_preferred_timezone();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null,
  title text not null,
  description text,
  task_type text not null,
  custom_type text,
  due_date date not null,
  due_time time,
  due_timezone text,
  due_at timestamptz,
  priority text not null,
  status text not null default 'Not Started',
  estimated_duration_minutes integer,
  reference_url text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_id_user_id_key unique (id, user_id),
  constraint tasks_subject_owner_fkey
    foreign key (subject_id, user_id)
    references public.subjects (id, user_id)
    on delete cascade,
  constraint tasks_title_nonempty_check
    check (char_length(public.trim_unicode_whitespace(title)) > 0),
  constraint tasks_type_check
    check (
      task_type in (
        'Assignment',
        'Quiz',
        'Examination',
        'Project',
        'Activity',
        'Laboratory',
        'Practical Exam',
        'Other'
      )
    ),
  constraint tasks_custom_type_check
    check (
      (task_type = 'Other'
        and custom_type is not null
        and char_length(public.trim_unicode_whitespace(custom_type)) > 0)
      or (task_type <> 'Other' and custom_type is null)
    ),
  constraint tasks_priority_check
    check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  constraint tasks_status_check
    check (status in ('Not Started', 'In Progress', 'Completed')),
  constraint tasks_deadline_shape_check
    check (
      (due_time is null and due_timezone is null and due_at is null)
      or (due_time is not null and due_timezone is not null and due_at is not null)
    ),
  constraint tasks_estimated_duration_check
    check (
      estimated_duration_minutes is null
      or estimated_duration_minutes > 0
    ),
  constraint tasks_version_check check (version > 0)
);

create table public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  old_values jsonb not null,
  new_values jsonb not null,
  changed_at timestamptz not null default now(),
  constraint task_history_task_owner_fkey
    foreign key (task_id, user_id)
    references public.tasks (id, user_id)
    on delete cascade,
  constraint task_history_event_type_check
    check (event_type in ('status_changed', 'deadline_changed')),
  constraint task_history_values_check
    check (
      jsonb_typeof(old_values) = 'object'
      and jsonb_typeof(new_values) = 'object'
    )
);

create index tasks_user_subject_deadline_idx
  on public.tasks (user_id, subject_id, due_date, due_time, id);

create index tasks_user_deadline_idx
  on public.tasks (user_id, due_date, due_time, id);

create index tasks_user_status_deadline_idx
  on public.tasks (user_id, status, due_date, due_time, id);

create index task_history_user_task_changed_idx
  on public.task_history (user_id, task_id, changed_at, id);

create index task_history_user_changed_idx
  on public.task_history (user_id, changed_at desc, id);

alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

revoke all on table public.tasks, public.task_history
  from public, anon, authenticated;

grant select on table public.tasks, public.task_history to authenticated;

create policy "Tasks are readable by their owner"
  on public.tasks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Task history is readable by its owner"
  on public.task_history
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.validate_task_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_period_id uuid;
  parent_archived_at timestamptz;
  parent_is_active boolean;
begin
  if new.due_time is null then
    if new.due_timezone is not null or new.due_at is not null then
      raise exception 'All-day tasks cannot have a timezone or resolved instant'
        using errcode = '23514';
    end if;
  else
    if new.due_timezone is null
      or new.due_at is null
      or not public.is_valid_iana_timezone(new.due_timezone) then
      raise exception 'Timed tasks require a valid IANA timezone and due instant'
        using errcode = '22023';
    end if;

    if (new.due_at at time zone new.due_timezone)
      is distinct from (new.due_date + new.due_time) then
      raise exception 'The due instant does not match the local deadline'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select subject.academic_period_id
    into parent_period_id
    from public.subjects as subject
    where subject.id = new.subject_id
      and subject.user_id = new.user_id;

    if not found then
      raise exception 'Subject not found' using errcode = '23503';
    end if;

    select period.archived_at
    into parent_archived_at
    from public.academic_periods as period
    where period.id = parent_period_id
      and period.user_id = new.user_id
    for update;

    if not found then
      raise exception 'Academic period not found' using errcode = '23503';
    end if;

    select subject.is_active
    into parent_is_active
    from public.subjects as subject
    where subject.id = new.subject_id
      and subject.user_id = new.user_id
    for update;

    if not found then
      raise exception 'Subject not found' using errcode = '23503';
    end if;

    if parent_archived_at is not null or not parent_is_active then
      raise exception 'Tasks cannot be created under an archived parent'
        using errcode = '23514';
    end if;

    new.created_at := pg_catalog.clock_timestamp();
    new.version := 1;
  else
    new.created_at := old.created_at;
    new.version := old.version + 1;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger tasks_validate_and_touch
  before insert or update on public.tasks
  for each row execute function public.validate_task_row();

create function public.set_task_history_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.changed_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger task_history_set_changed_at
  before insert on public.task_history
  for each row execute function public.set_task_history_changed_at();

create function public.touch_task_parent_records(
  p_subject_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  parent_period_id uuid;
begin
  select subject.academic_period_id
  into parent_period_id
  from public.subjects as subject
  where subject.id = p_subject_id
    and subject.user_id = p_user_id;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  update public.subjects
  set updated_at = pg_catalog.clock_timestamp()
  where id = p_subject_id
    and user_id = p_user_id;

  update public.academic_periods
  set updated_at = pg_catalog.clock_timestamp()
  where id = parent_period_id
    and user_id = p_user_id;
end;
$$;

create function public.lock_task_parent_rows(
  p_task_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  parent_subject_id uuid;
  parent_period_id uuid;
begin
  select task.subject_id
  into parent_subject_id
  from public.tasks as task
  where task.id = p_task_id
    and task.user_id = p_user_id;

  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  select subject.academic_period_id
  into parent_period_id
  from public.subjects as subject
  where subject.id = parent_subject_id
    and subject.user_id = p_user_id;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.academic_periods as period
  where period.id = parent_period_id
    and period.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Academic period not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.subjects as subject
  where subject.id = parent_subject_id
    and subject.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  return parent_subject_id;
end;
$$;

create function public.set_preferred_timezone(p_timezone text)
returns public.workspace_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  settings public.workspace_settings;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.is_valid_iana_timezone(p_timezone) then
    raise exception 'Unsupported IANA timezone' using errcode = '22023';
  end if;

  insert into public.workspace_settings (user_id, preferred_timezone)
  values (owner_id, p_timezone)
  on conflict (user_id)
  do update set preferred_timezone = excluded.preferred_timezone
  returning * into settings;

  return settings;
end;
$$;

create function public.create_task(
  p_subject_id uuid,
  p_title text,
  p_description text,
  p_task_type text,
  p_custom_type text,
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
  owner_id uuid := auth.uid();
  created_task public.tasks;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.tasks (
    user_id,
    subject_id,
    title,
    description,
    task_type,
    custom_type,
    due_date,
    due_time,
    due_timezone,
    due_at,
    priority,
    estimated_duration_minutes,
    reference_url
  )
  values (
    owner_id,
    p_subject_id,
    p_title,
    p_description,
    p_task_type,
    p_custom_type,
    p_due_date,
    p_due_time,
    p_due_timezone,
    p_due_at,
    p_priority,
    p_estimated_duration_minutes,
    p_reference_url
  )
  returning * into created_task;

  perform public.touch_task_parent_records(created_task.subject_id, owner_id);

  return jsonb_build_object(
    'status', 'created',
    'task', to_jsonb(created_task)
  );
end;
$$;

create function public.update_task(
  p_task_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_task_type text,
  p_custom_type text,
  p_due_date date,
  p_due_time time,
  p_due_timezone text,
  p_due_at timestamptz,
  p_priority text,
  p_status text,
  p_estimated_duration_minutes integer,
  p_reference_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  parent_subject_id uuid;
  existing_task public.tasks;
  updated_task public.tasks;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  parent_subject_id := public.lock_task_parent_rows(p_task_id, owner_id);

  select *
  into existing_task
  from public.tasks
  where id = p_task_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if p_expected_version is null
    or existing_task.version is distinct from p_expected_version then
    return jsonb_build_object(
      'status', 'review_required',
      'task', to_jsonb(existing_task)
    );
  end if;

  update public.tasks
  set title = p_title,
      description = p_description,
      task_type = p_task_type,
      custom_type = p_custom_type,
      due_date = p_due_date,
      due_time = p_due_time,
      due_timezone = p_due_timezone,
      due_at = p_due_at,
      priority = p_priority,
      status = p_status,
      estimated_duration_minutes = p_estimated_duration_minutes,
      reference_url = p_reference_url
  where id = p_task_id
    and user_id = owner_id
  returning * into updated_task;

  if existing_task.status is distinct from updated_task.status then
    insert into public.task_history (
      task_id,
      user_id,
      event_type,
      old_values,
      new_values
    )
    values (
      updated_task.id,
      owner_id,
      'status_changed',
      jsonb_build_object('status', existing_task.status),
      jsonb_build_object('status', updated_task.status)
    );
  end if;

  if (existing_task.due_date, existing_task.due_time,
      existing_task.due_timezone, existing_task.due_at)
    is distinct from
      (updated_task.due_date, updated_task.due_time,
       updated_task.due_timezone, updated_task.due_at) then
    insert into public.task_history (
      task_id,
      user_id,
      event_type,
      old_values,
      new_values
    )
    values (
      updated_task.id,
      owner_id,
      'deadline_changed',
      jsonb_build_object(
        'due_date', existing_task.due_date,
        'due_time', existing_task.due_time,
        'due_timezone', existing_task.due_timezone,
        'due_at', existing_task.due_at
      ),
      jsonb_build_object(
        'due_date', updated_task.due_date,
        'due_time', updated_task.due_time,
        'due_timezone', updated_task.due_timezone,
        'due_at', updated_task.due_at
      )
    );
  end if;

  perform public.touch_task_parent_records(parent_subject_id, owner_id);

  return jsonb_build_object(
    'status', 'updated',
    'task', to_jsonb(updated_task)
  );
end;
$$;

create function public.delete_task(
  p_task_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  parent_subject_id uuid;
  existing_task public.tasks;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  parent_subject_id := public.lock_task_parent_rows(p_task_id, owner_id);

  select *
  into existing_task
  from public.tasks
  where id = p_task_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if p_expected_version is null
    or existing_task.version is distinct from p_expected_version then
    return jsonb_build_object(
      'status', 'review_required',
      'task', to_jsonb(existing_task)
    );
  end if;

  delete from public.tasks
  where id = p_task_id
    and user_id = owner_id;

  perform public.touch_task_parent_records(parent_subject_id, owner_id);

  return jsonb_build_object('status', 'deleted');
end;
$$;

create or replace function public.permanently_delete_archived_subject(
  p_subject_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  period_id uuid;
  period_archived_at timestamptz;
  academic_subject public.subjects;
  actual_task_count integer;
  actual_history_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select academic_period_id
  into period_id
  from public.subjects
  where id = p_subject_id
    and user_id = owner_id;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  select archived_at
  into period_archived_at
  from public.academic_periods
  where id = period_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Academic period not found' using errcode = 'P0002';
  end if;

  select *
  into academic_subject
  from public.subjects
  where id = p_subject_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  if academic_subject.is_active and period_archived_at is null then
    raise exception 'Only archived subjects can be deleted'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into actual_task_count
  from public.tasks
  where subject_id = academic_subject.id
    and user_id = owner_id;

  select count(*)::integer
  into actual_history_count
  from public.task_history as history
  join public.tasks as task
    on task.id = history.task_id
    and task.user_id = history.user_id
  where task.subject_id = academic_subject.id
    and task.user_id = owner_id;

  if academic_subject.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'review_required',
      'subject', jsonb_build_object(
        'id', academic_subject.id,
        'name', academic_subject.name,
        'subject_code', academic_subject.subject_code,
        'instructor', academic_subject.instructor,
        'task_count', actual_task_count,
        'history_count', actual_history_count,
        'updated_at', academic_subject.updated_at
      )
    );
  end if;

  delete from public.tasks
  where subject_id = academic_subject.id
    and user_id = owner_id;

  delete from public.subjects
  where id = academic_subject.id
    and user_id = owner_id;

  update public.academic_periods
  set updated_at = pg_catalog.clock_timestamp()
  where id = period_id
    and user_id = owner_id;

  return jsonb_build_object(
    'status', 'deleted',
    'deleted_task_count', actual_task_count,
    'deleted_history_count', actual_history_count
  );
end;
$$;

create or replace function public.permanently_delete_archived_period(
  p_academic_period_id uuid,
  p_expected_subject_count integer,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  academic_period public.academic_periods;
  actual_subject_count integer;
  actual_task_count integer;
  actual_history_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into academic_period
  from public.academic_periods
  where id = p_academic_period_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Academic period not found' using errcode = 'P0002';
  end if;

  if academic_period.archived_at is null then
    raise exception 'Only archived academic periods can be deleted'
      using errcode = '23514';
  end if;

  perform 1
  from public.subjects as subject
  where subject.academic_period_id = academic_period.id
    and subject.user_id = owner_id
  order by subject.id
  for update;

  select count(*)::integer
  into actual_subject_count
  from public.subjects
  where academic_period_id = academic_period.id
    and user_id = owner_id;

  select count(*)::integer
  into actual_task_count
  from public.tasks as task
  join public.subjects as subject
    on subject.id = task.subject_id
    and subject.user_id = task.user_id
  where subject.academic_period_id = academic_period.id
    and task.user_id = owner_id;

  select count(*)::integer
  into actual_history_count
  from public.task_history as history
  join public.tasks as task
    on task.id = history.task_id
    and task.user_id = history.user_id
  join public.subjects as subject
    on subject.id = task.subject_id
    and subject.user_id = task.user_id
  where subject.academic_period_id = academic_period.id
    and task.user_id = owner_id;

  if p_expected_subject_count is null
    or actual_subject_count is distinct from p_expected_subject_count
    or academic_period.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'review_required',
      'academic_period', jsonb_build_object(
        'id', academic_period.id,
        'academic_year_id', academic_period.academic_year_id,
        'name', academic_period.name,
        'subject_count', actual_subject_count,
        'task_count', actual_task_count,
        'history_count', actual_history_count,
        'updated_at', academic_period.updated_at
      )
    );
  end if;

  delete from public.tasks as task
  using public.subjects as subject
  where subject.academic_period_id = academic_period.id
    and subject.user_id = owner_id
    and task.subject_id = subject.id
    and task.user_id = subject.user_id;

  delete from public.subjects
  where academic_period_id = academic_period.id
    and user_id = owner_id;

  delete from public.academic_periods
  where id = academic_period.id
    and user_id = owner_id;

  return jsonb_build_object(
    'status', 'deleted',
    'deleted_subject_count', actual_subject_count,
    'deleted_task_count', actual_task_count,
    'deleted_history_count', actual_history_count
  );
end;
$$;

alter function public.is_valid_iana_timezone(text) owner to postgres;
alter function public.validate_workspace_preferred_timezone() owner to postgres;
alter function public.validate_task_row() owner to postgres;
alter function public.set_task_history_changed_at() owner to postgres;
alter function public.touch_task_parent_records(uuid, uuid) owner to postgres;
alter function public.lock_task_parent_rows(uuid, uuid) owner to postgres;
alter function public.set_preferred_timezone(text) owner to postgres;
alter function public.create_task(uuid, text, text, text, text, date, time, text, timestamptz, text, integer, text) owner to postgres;
alter function public.update_task(uuid, integer, text, text, text, text, date, time, text, timestamptz, text, text, integer, text) owner to postgres;
alter function public.delete_task(uuid, integer) owner to postgres;
alter function public.permanently_delete_archived_subject(uuid, timestamptz) owner to postgres;
alter function public.permanently_delete_archived_period(uuid, integer, timestamptz) owner to postgres;

revoke all on function public.is_valid_iana_timezone(text) from public, anon, authenticated;
revoke all on function public.validate_workspace_preferred_timezone() from public, anon, authenticated;
revoke all on function public.validate_task_row() from public, anon, authenticated;
revoke all on function public.set_task_history_changed_at() from public, anon, authenticated;
revoke all on function public.touch_task_parent_records(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lock_task_parent_rows(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_preferred_timezone(text) from public, anon, authenticated;
revoke all on function public.create_task(uuid, text, text, text, text, date, time, text, timestamptz, text, integer, text) from public, anon, authenticated;
revoke all on function public.update_task(uuid, integer, text, text, text, text, date, time, text, timestamptz, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.delete_task(uuid, integer) from public, anon, authenticated;
revoke all on function public.permanently_delete_archived_subject(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.permanently_delete_archived_period(uuid, integer, timestamptz) from public, anon, authenticated;

grant execute on function public.set_preferred_timezone(text) to authenticated;
grant execute on function public.create_task(uuid, text, text, text, text, date, time, text, timestamptz, text, integer, text) to authenticated;
grant execute on function public.update_task(uuid, integer, text, text, text, text, date, time, text, timestamptz, text, text, integer, text) to authenticated;
grant execute on function public.delete_task(uuid, integer) to authenticated;
grant execute on function public.permanently_delete_archived_subject(uuid, timestamptz) to authenticated;
grant execute on function public.permanently_delete_archived_period(uuid, integer, timestamptz) to authenticated;
