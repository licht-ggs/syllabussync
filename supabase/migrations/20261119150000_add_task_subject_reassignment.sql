alter table public.task_history
  drop constraint task_history_event_type_check;

alter table public.task_history
  add constraint task_history_event_type_check
  check (
    event_type in (
      'status_changed',
      'deadline_changed',
      'subject_reassigned'
    )
  );

create function public.lock_task_reassignment_parent_rows(
  p_task_id uuid,
  p_destination_subject_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  source_subject_id uuid;
  source_period_id uuid;
  destination_subject_id uuid;
  destination_period_id uuid;
  locked_period_id uuid;
  locked_subject_id uuid;
  expected_period_count integer;
  expected_subject_count integer;
  locked_period_count integer := 0;
  locked_subject_count integer := 0;
begin
  select task.subject_id
  into source_subject_id
  from public.tasks as task
  where task.id = p_task_id
    and task.user_id = p_user_id;

  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  select subject.academic_period_id
  into source_period_id
  from public.subjects as subject
  where subject.id = source_subject_id
    and subject.user_id = p_user_id;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  destination_subject_id := coalesce(
    p_destination_subject_id,
    source_subject_id
  );

  select subject.academic_period_id
  into destination_period_id
  from public.subjects as subject
  where subject.id = destination_subject_id
    and subject.user_id = p_user_id;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  expected_period_count := case
    when source_period_id = destination_period_id then 1
    else 2
  end;
  expected_subject_count := case
    when source_subject_id = destination_subject_id then 1
    else 2
  end;

  for locked_period_id in
    select period.id
    from public.academic_periods as period
    where period.user_id = p_user_id
      and period.id in (source_period_id, destination_period_id)
    order by period.id
    for update
  loop
    locked_period_count := locked_period_count + 1;
  end loop;

  if locked_period_count <> expected_period_count then
    raise exception 'Academic period not found' using errcode = 'P0002';
  end if;

  for locked_subject_id in
    select subject.id
    from public.subjects as subject
    where subject.user_id = p_user_id
      and subject.id in (source_subject_id, destination_subject_id)
    order by subject.id
    for update
  loop
    locked_subject_count := locked_subject_count + 1;
  end loop;

  if locked_subject_count <> expected_subject_count then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  return source_subject_id;
end;
$$;

drop function public.update_task(
  uuid,
  integer,
  text,
  text,
  text,
  text,
  date,
  time,
  text,
  timestamptz,
  text,
  text,
  integer,
  text
);

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
  p_reference_url text,
  p_subject_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  parent_subject_id uuid;
  target_subject_is_active boolean;
  target_period_archived_at timestamptz;
  existing_task public.tasks;
  updated_task public.tasks;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  parent_subject_id := public.lock_task_reassignment_parent_rows(
    p_task_id,
    p_subject_id,
    owner_id
  );

  select *
  into existing_task
  from public.tasks
  where id = p_task_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if existing_task.subject_id is distinct from parent_subject_id
    or p_expected_version is null
    or existing_task.version is distinct from p_expected_version then
    return jsonb_build_object(
      'status', 'review_required',
      'task', to_jsonb(existing_task)
    );
  end if;

  if p_subject_id is not null
    and p_subject_id is distinct from existing_task.subject_id then
    select subject.is_active, period.archived_at
    into target_subject_is_active, target_period_archived_at
    from public.subjects as subject
    join public.academic_periods as period
      on period.id = subject.academic_period_id
      and period.user_id = subject.user_id
    where subject.id = p_subject_id
      and subject.user_id = owner_id;

    if not found then
      raise exception 'Subject not found' using errcode = 'P0002';
    end if;

    if not target_subject_is_active or target_period_archived_at is not null then
      raise exception 'Tasks cannot be reassigned to an archived parent'
        using errcode = '23514';
    end if;
  end if;

  update public.tasks
  set subject_id = coalesce(p_subject_id, existing_task.subject_id),
      title = p_title,
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

  if existing_task.subject_id is distinct from updated_task.subject_id then
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
      'subject_reassigned',
      jsonb_build_object('subject_id', existing_task.subject_id),
      jsonb_build_object('subject_id', updated_task.subject_id)
    );
  end if;

  perform public.touch_task_parent_records(parent_subject_id, owner_id);

  if parent_subject_id is distinct from updated_task.subject_id then
    perform public.touch_task_parent_records(updated_task.subject_id, owner_id);
  end if;

  return jsonb_build_object(
    'status', 'updated',
    'task', to_jsonb(updated_task)
  );
end;
$$;

alter function public.lock_task_reassignment_parent_rows(uuid, uuid, uuid) owner to postgres;
alter function public.update_task(uuid, integer, text, text, text, text, date, time, text, timestamptz, text, text, integer, text, uuid) owner to postgres;

revoke all on function public.lock_task_reassignment_parent_rows(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_task(uuid, integer, text, text, text, text, date, time, text, timestamptz, text, text, integer, text, uuid) from public, anon, authenticated;

grant execute on function public.update_task(uuid, integer, text, text, text, text, date, time, text, timestamptz, text, text, integer, text, uuid) to authenticated;
