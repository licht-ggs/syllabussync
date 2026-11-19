create function public.trim_unicode_whitespace(input_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    normalize(input_name, NFC),
    U&'^[[:space:]\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000]+|[[:space:]\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000]+$',
    '',
    'g'
  )
$$;

create function public.canonicalize_academic_name(input_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select translate(
    public.trim_unicode_whitespace(input_name),
    U&'\2010\2011\2012\2013\2014\2015\2212\FF0D\FE58\FE63',
    '----------'
  )
$$;

create function public.normalize_academic_name(input_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lower(public.canonicalize_academic_name(input_name))
$$;

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_id_user_id_key unique (id, user_id),
  constraint academic_years_name_length_check
    check (char_length(name) between 1 and 120)
);

create unique index academic_years_user_normalized_name_key
  on public.academic_years (user_id, public.normalize_academic_name(name));

create table public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  academic_year_id uuid not null,
  name text not null,
  start_date date,
  end_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_periods_id_user_id_key unique (id, user_id),
  constraint academic_periods_year_owner_fkey
    foreign key (academic_year_id, user_id)
    references public.academic_years (id, user_id)
    on delete cascade,
  constraint academic_periods_name_length_check
    check (char_length(name) between 1 and 120),
  constraint academic_periods_date_order_check
    check (start_date is null or end_date is null or end_date >= start_date)
);

create unique index academic_periods_year_normalized_name_key
  on public.academic_periods (
    academic_year_id,
    user_id,
    public.normalize_academic_name(name)
  );

create index academic_periods_user_year_order_idx
  on public.academic_periods (user_id, academic_year_id, start_date, created_at);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  academic_period_id uuid not null,
  name text not null,
  subject_code text,
  instructor text,
  units numeric(6, 2),
  schedule_text text,
  room text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_id_user_id_key unique (id, user_id),
  constraint subjects_period_owner_fkey
    foreign key (academic_period_id, user_id)
    references public.academic_periods (id, user_id)
    on delete cascade,
  constraint subjects_name_length_check
    check (
      char_length(public.trim_unicode_whitespace(name)) between 1 and 160
    ),
  constraint subjects_code_length_check
    check (subject_code is null or char_length(subject_code) <= 40),
  constraint subjects_instructor_length_check
    check (instructor is null or char_length(instructor) <= 120),
  constraint subjects_units_nonnegative_check
    check (units is null or units >= 0),
  constraint subjects_schedule_length_check
    check (schedule_text is null or char_length(schedule_text) <= 2000),
  constraint subjects_room_length_check
    check (room is null or char_length(room) <= 120)
);

create index subjects_user_period_idx
  on public.subjects (user_id, academic_period_id, created_at);

create table public.workspace_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_academic_period_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_settings_period_owner_fkey
    foreign key (current_academic_period_id, user_id)
    references public.academic_periods (id, user_id)
    on delete restrict
);

alter table public.academic_years enable row level security;
alter table public.academic_periods enable row level security;
alter table public.subjects enable row level security;
alter table public.workspace_settings enable row level security;

revoke all on table
  public.academic_years,
  public.academic_periods,
  public.subjects,
  public.workspace_settings
from public, anon, authenticated;

grant select on table
  public.academic_years,
  public.academic_periods,
  public.subjects,
  public.workspace_settings
to authenticated;

create policy "Academic years are readable by their owner"
  on public.academic_years
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Academic periods are readable by their owner"
  on public.academic_periods
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Subjects are readable by their owner"
  on public.subjects
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Workspace settings are readable by their owner"
  on public.workspace_settings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.canonicalize_academic_row_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := public.canonicalize_academic_name(new.name);
  return new;
end;
$$;

create trigger academic_years_canonicalize_name
  before insert or update of name on public.academic_years
  for each row execute function public.canonicalize_academic_row_name();

create trigger academic_periods_canonicalize_name
  before insert or update of name on public.academic_periods
  for each row execute function public.canonicalize_academic_row_name();

create function public.touch_academic_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger academic_years_touch_updated_at
  before update on public.academic_years
  for each row execute function public.touch_academic_updated_at();

create trigger academic_periods_touch_updated_at
  before update on public.academic_periods
  for each row execute function public.touch_academic_updated_at();

create trigger subjects_touch_updated_at
  before update on public.subjects
  for each row execute function public.touch_academic_updated_at();

create trigger workspace_settings_touch_updated_at
  before update on public.workspace_settings
  for each row execute function public.touch_academic_updated_at();

create function public.validate_current_academic_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  period_archived_at timestamptz;
begin
  if new.current_academic_period_id is null then
    return new;
  end if;

  select archived_at
  into period_archived_at
  from public.academic_periods
  where id = new.current_academic_period_id
    and user_id = new.user_id;

  if not found then
    raise exception 'Current academic period is unavailable'
      using errcode = '23503';
  end if;

  if period_archived_at is not null then
    raise exception 'An archived academic period cannot be current'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger workspace_settings_validate_current_period
  before insert or update of current_academic_period_id, user_id
  on public.workspace_settings
  for each row execute function public.validate_current_academic_period();

create function public.clear_current_period_when_archived()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    update public.workspace_settings
    set current_academic_period_id = null
    where user_id = new.user_id
      and current_academic_period_id = new.id;
  end if;

  return new;
end;
$$;

create trigger academic_periods_clear_current_when_archived
  after update of archived_at on public.academic_periods
  for each row execute function public.clear_current_period_when_archived();

create function public.remove_workspace_settings_before_auth_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workspace_settings
  where user_id = old.id;

  return old;
end;
$$;

alter function public.remove_workspace_settings_before_auth_user_delete()
  owner to postgres;

revoke all on function public.remove_workspace_settings_before_auth_user_delete()
  from public, anon, authenticated;

create trigger academic_workspace_cleanup_settings_before_user_delete
  before delete on auth.users
  for each row
  execute function public.remove_workspace_settings_before_auth_user_delete();

create function public.create_academic_year(p_name text)
returns public.academic_years
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  created_year public.academic_years;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.academic_years (user_id, name)
  values (owner_id, public.canonicalize_academic_name(p_name))
  returning * into created_year;

  return created_year;
end;
$$;

create function public.update_academic_year(
  p_academic_year_id uuid,
  p_name text
)
returns public.academic_years
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  updated_year public.academic_years;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.academic_years
  set name = public.canonicalize_academic_name(p_name)
  where id = p_academic_year_id
    and user_id = owner_id
  returning * into updated_year;

  if not found then
    raise exception 'Academic year not found' using errcode = 'P0002';
  end if;

  return updated_year;
end;
$$;

create function public.delete_academic_year(
  p_academic_year_id uuid,
  p_expected_period_count integer,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  academic_year public.academic_years;
  actual_period_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into academic_year
  from public.academic_years
  where id = p_academic_year_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Academic year not found' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into actual_period_count
  from public.academic_periods
  where academic_year_id = academic_year.id
    and user_id = owner_id;

  if actual_period_count <> p_expected_period_count
    or academic_year.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'review_required',
      'academic_year', jsonb_build_object(
        'id', academic_year.id,
        'name', academic_year.name,
        'period_count', actual_period_count,
        'updated_at', academic_year.updated_at
      )
    );
  end if;

  if actual_period_count <> 0 then
    return jsonb_build_object(
      'status', 'blocked',
      'academic_year', jsonb_build_object(
        'id', academic_year.id,
        'name', academic_year.name,
        'period_count', actual_period_count,
        'updated_at', academic_year.updated_at
      )
    );
  end if;

  delete from public.academic_years
  where id = academic_year.id
    and user_id = owner_id;

  return jsonb_build_object('status', 'deleted');
end;
$$;

create function public.create_academic_period(
  p_academic_year_id uuid,
  p_name text,
  p_start_date date default null,
  p_end_date date default null
)
returns public.academic_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  created_period public.academic_periods;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform 1
  from public.academic_years
  where id = p_academic_year_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Academic year not found' using errcode = 'P0002';
  end if;

  insert into public.academic_periods (
    user_id,
    academic_year_id,
    name,
    start_date,
    end_date
  )
  values (
    owner_id,
    p_academic_year_id,
    public.canonicalize_academic_name(p_name),
    p_start_date,
    p_end_date
  )
  returning * into created_period;

  return created_period;
end;
$$;

create function public.update_academic_period(
  p_academic_period_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date
)
returns public.academic_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  updated_period public.academic_periods;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.academic_periods
  set name = public.canonicalize_academic_name(p_name),
      start_date = p_start_date,
      end_date = p_end_date
  where id = p_academic_period_id
    and user_id = owner_id
  returning * into updated_period;

  if not found then
    raise exception 'Academic period not found' using errcode = 'P0002';
  end if;

  return updated_period;
end;
$$;

create function public.select_current_academic_period(
  p_academic_period_id uuid
)
returns public.workspace_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  selected_period public.academic_periods;
  settings public.workspace_settings;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into selected_period
  from public.academic_periods
  where id = p_academic_period_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Academic period not found' using errcode = 'P0002';
  end if;

  if selected_period.archived_at is not null then
    raise exception 'An archived academic period cannot be selected'
      using errcode = '23514';
  end if;

  insert into public.workspace_settings (
    user_id,
    current_academic_period_id
  )
  values (owner_id, selected_period.id)
  on conflict (user_id)
  do update
    set current_academic_period_id = excluded.current_academic_period_id
  returning * into settings;

  return settings;
end;
$$;

create function public.archive_academic_period(p_academic_period_id uuid)
returns public.academic_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  academic_period public.academic_periods;
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
    update public.academic_periods
    set archived_at = pg_catalog.now()
    where id = academic_period.id
      and user_id = owner_id
    returning * into academic_period;
  end if;

  return academic_period;
end;
$$;

create function public.restore_academic_period(p_academic_period_id uuid)
returns public.academic_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  academic_period public.academic_periods;
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

  if academic_period.archived_at is not null then
    update public.academic_periods
    set archived_at = null
    where id = academic_period.id
      and user_id = owner_id
    returning * into academic_period;
  end if;

  return academic_period;
end;
$$;

create function public.create_subject(
  p_academic_period_id uuid,
  p_name text,
  p_subject_code text default null,
  p_instructor text default null,
  p_units numeric default null,
  p_schedule_text text default null,
  p_room text default null
)
returns public.subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  academic_period public.academic_periods;
  created_subject public.subjects;
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

  if academic_period.archived_at is not null then
    raise exception 'Cannot add a subject to an archived academic period'
      using errcode = '23514';
  end if;

  insert into public.subjects (
    user_id,
    academic_period_id,
    name,
    subject_code,
    instructor,
    units,
    schedule_text,
    room
  )
  values (
    owner_id,
    academic_period.id,
    public.trim_unicode_whitespace(p_name),
    nullif(public.trim_unicode_whitespace(p_subject_code), ''),
    nullif(public.trim_unicode_whitespace(p_instructor), ''),
    p_units,
    nullif(public.trim_unicode_whitespace(p_schedule_text), ''),
    nullif(public.trim_unicode_whitespace(p_room), '')
  )
  returning * into created_subject;

  update public.academic_periods
  set updated_at = pg_catalog.clock_timestamp()
  where id = academic_period.id
    and user_id = owner_id;

  return created_subject;
end;
$$;

create function public.update_subject(
  p_subject_id uuid,
  p_name text,
  p_subject_code text,
  p_instructor text,
  p_units numeric,
  p_schedule_text text,
  p_room text
)
returns public.subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  period_id uuid;
  updated_subject public.subjects;
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

  perform 1
  from public.academic_periods
  where id = period_id
    and user_id = owner_id
  for update;

  if not found then
    raise exception 'Academic period not found' using errcode = 'P0002';
  end if;

  update public.subjects
  set name = public.trim_unicode_whitespace(p_name),
      subject_code = nullif(public.trim_unicode_whitespace(p_subject_code), ''),
      instructor = nullif(public.trim_unicode_whitespace(p_instructor), ''),
      units = p_units,
      schedule_text = nullif(public.trim_unicode_whitespace(p_schedule_text), ''),
      room = nullif(public.trim_unicode_whitespace(p_room), '')
  where id = p_subject_id
    and user_id = owner_id
  returning * into updated_subject;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  update public.academic_periods
  set updated_at = pg_catalog.clock_timestamp()
  where id = period_id
    and user_id = owner_id;

  return updated_subject;
end;
$$;

create function public.archive_subject(p_subject_id uuid)
returns public.subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  period_id uuid;
  period_archived_at timestamptz;
  academic_subject public.subjects;
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

  if period_archived_at is not null then
    raise exception 'Subjects in archived periods cannot be archived separately'
      using errcode = '23514';
  end if;

  update public.subjects
  set is_active = false
  where id = p_subject_id
    and user_id = owner_id
  returning * into academic_subject;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  update public.academic_periods
  set updated_at = pg_catalog.clock_timestamp()
  where id = period_id
    and user_id = owner_id;

  return academic_subject;
end;
$$;

create function public.restore_subject(p_subject_id uuid)
returns public.subjects
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  period_id uuid;
  period_archived_at timestamptz;
  academic_subject public.subjects;
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

  if period_archived_at is not null then
    raise exception 'Restore the academic period before restoring its subjects'
      using errcode = '23514';
  end if;

  update public.subjects
  set is_active = true
  where id = p_subject_id
    and user_id = owner_id
  returning * into academic_subject;

  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;

  update public.academic_periods
  set updated_at = pg_catalog.clock_timestamp()
  where id = period_id
    and user_id = owner_id;

  return academic_subject;
end;
$$;

create function public.permanently_delete_archived_period(
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

  select count(*)::integer
  into actual_subject_count
  from public.subjects
  where academic_period_id = academic_period.id
    and user_id = owner_id;

  if actual_subject_count <> p_expected_subject_count
    or academic_period.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'review_required',
      'academic_period', jsonb_build_object(
        'id', academic_period.id,
        'academic_year_id', academic_period.academic_year_id,
        'name', academic_period.name,
        'subject_count', actual_subject_count,
        'updated_at', academic_period.updated_at
      )
    );
  end if;

  delete from public.academic_periods
  where id = academic_period.id
    and user_id = owner_id;

  return jsonb_build_object('status', 'deleted');
end;
$$;

create function public.permanently_delete_archived_subject(
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

  if academic_subject.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'review_required',
      'subject', jsonb_build_object(
        'id', academic_subject.id,
        'name', academic_subject.name,
        'subject_code', academic_subject.subject_code,
        'instructor', academic_subject.instructor,
        'updated_at', academic_subject.updated_at
      )
    );
  end if;

  delete from public.subjects
  where id = academic_subject.id
    and user_id = owner_id;

  update public.academic_periods
  set updated_at = pg_catalog.clock_timestamp()
  where id = period_id
    and user_id = owner_id;

  return jsonb_build_object('status', 'deleted');
end;
$$;

alter function public.create_academic_year(text) owner to postgres;
alter function public.update_academic_year(uuid, text) owner to postgres;
alter function public.delete_academic_year(uuid, integer, timestamptz) owner to postgres;
alter function public.create_academic_period(uuid, text, date, date) owner to postgres;
alter function public.update_academic_period(uuid, text, date, date) owner to postgres;
alter function public.select_current_academic_period(uuid) owner to postgres;
alter function public.archive_academic_period(uuid) owner to postgres;
alter function public.restore_academic_period(uuid) owner to postgres;
alter function public.create_subject(uuid, text, text, text, numeric, text, text) owner to postgres;
alter function public.update_subject(uuid, text, text, text, numeric, text, text) owner to postgres;
alter function public.archive_subject(uuid) owner to postgres;
alter function public.restore_subject(uuid) owner to postgres;
alter function public.permanently_delete_archived_period(uuid, integer, timestamptz) owner to postgres;
alter function public.permanently_delete_archived_subject(uuid, timestamptz) owner to postgres;

revoke all on function public.create_academic_year(text) from public, anon, authenticated;
revoke all on function public.update_academic_year(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_academic_year(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.create_academic_period(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.update_academic_period(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.select_current_academic_period(uuid) from public, anon, authenticated;
revoke all on function public.archive_academic_period(uuid) from public, anon, authenticated;
revoke all on function public.restore_academic_period(uuid) from public, anon, authenticated;
revoke all on function public.create_subject(uuid, text, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.update_subject(uuid, text, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.archive_subject(uuid) from public, anon, authenticated;
revoke all on function public.restore_subject(uuid) from public, anon, authenticated;
revoke all on function public.permanently_delete_archived_period(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.permanently_delete_archived_subject(uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.create_academic_year(text) to authenticated;
grant execute on function public.update_academic_year(uuid, text) to authenticated;
grant execute on function public.delete_academic_year(uuid, integer, timestamptz) to authenticated;
grant execute on function public.create_academic_period(uuid, text, date, date) to authenticated;
grant execute on function public.update_academic_period(uuid, text, date, date) to authenticated;
grant execute on function public.select_current_academic_period(uuid) to authenticated;
grant execute on function public.archive_academic_period(uuid) to authenticated;
grant execute on function public.restore_academic_period(uuid) to authenticated;
grant execute on function public.create_subject(uuid, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.update_subject(uuid, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.archive_subject(uuid) to authenticated;
grant execute on function public.restore_subject(uuid) to authenticated;
grant execute on function public.permanently_delete_archived_period(uuid, integer, timestamptz) to authenticated;
grant execute on function public.permanently_delete_archived_subject(uuid, timestamptz) to authenticated;

revoke all on function public.canonicalize_academic_row_name() from public, anon, authenticated;
revoke all on function public.touch_academic_updated_at() from public, anon, authenticated;
revoke all on function public.validate_current_academic_period() from public, anon, authenticated;
revoke all on function public.clear_current_period_when_archived() from public, anon, authenticated;
