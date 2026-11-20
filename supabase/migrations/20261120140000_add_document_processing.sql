alter table public.academic_documents
  add column processing_generation integer not null default 0
    check (processing_generation >= 0);

alter table public.academic_documents
  drop constraint academic_documents_processing_status_check;

alter table public.academic_documents
  add constraint academic_documents_processing_status_check
    check (processing_status in (
      'uploading', 'uploaded', 'upload_failed', 'deletion_pending',
      'queued', 'processing', 'text_extracted', 'processing_failed'
    ));

create table public.academic_document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  owner_id uuid not null,
  generation integer not null check (generation > 0),
  status text not null default 'queued',
  progress_percent integer not null default 0
    check (progress_percent between 0 and 100),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 3),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint academic_document_processing_jobs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed')),
  constraint academic_document_processing_jobs_error_check
    check (error_code is null or error_code in (
      'source_unavailable', 'invalid_pdf', 'page_limit_exceeded',
      'render_failed', 'ocr_failed', 'partial_page_failure', 'worker_error'
    )),
  constraint academic_document_processing_jobs_document_generation_key
    unique (document_id, generation),
  constraint academic_document_processing_jobs_document_owner_fkey
    foreign key (document_id, owner_id)
    references public.academic_documents (id, owner_id)
    on delete cascade
);

create index academic_document_processing_jobs_queue_idx
  on public.academic_document_processing_jobs (created_at, id)
  where status = 'queued';

create table public.academic_document_pages (
  document_id uuid not null,
  owner_id uuid not null,
  page_number integer not null check (page_number between 1 and 200),
  extracted_text text not null default '',
  extraction_method text not null,
  extraction_status text not null,
  error_code text,
  updated_at timestamptz not null default now(),
  constraint academic_document_pages_method_check
    check (extraction_method in ('native_text', 'ocr', 'mixed', 'none')),
  constraint academic_document_pages_status_check
    check (extraction_status in ('completed', 'partial', 'failed')),
  constraint academic_document_pages_error_check
    check (error_code is null or error_code in (
      'native_extraction_failed', 'render_failed', 'ocr_failed'
    )),
  primary key (document_id, page_number),
  constraint academic_document_pages_document_owner_fkey
    foreign key (document_id, owner_id)
    references public.academic_documents (id, owner_id)
    on delete cascade
);

create index academic_document_pages_owner_document_idx
  on public.academic_document_pages (owner_id, document_id, page_number);

alter table public.academic_document_processing_jobs enable row level security;
alter table public.academic_document_pages enable row level security;

revoke all on table public.academic_document_processing_jobs from public, anon, authenticated;
revoke all on table public.academic_document_pages from public, anon, authenticated;
grant select on table public.academic_document_processing_jobs to authenticated;
grant select on table public.academic_document_pages to authenticated;

grant all on table public.academic_document_processing_jobs to service_role;
grant all on table public.academic_document_pages to service_role;

create policy "Document owners can read their processing jobs"
  on public.academic_document_processing_jobs
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Document owners can read their extracted pages"
  on public.academic_document_pages
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create trigger academic_document_processing_jobs_set_updated_at
  before update on public.academic_document_processing_jobs
  for each row execute function public.touch_academic_updated_at();

create function public.queue_academic_document_processing(p_document_id uuid)
returns public.academic_document_processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_row public.academic_documents;
  job_row public.academic_document_processing_jobs;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into document_row
    from public.academic_documents
    where id = p_document_id and owner_id = auth.uid()
    for update;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  if document_row.processing_status in ('queued', 'processing') then
    select * into job_row from public.academic_document_processing_jobs
      where document_id = p_document_id
        and generation = document_row.processing_generation;
    return job_row;
  end if;

  if document_row.processing_status not in ('uploaded', 'processing_failed') then
    raise exception 'Document cannot be processed in its current state' using errcode = '22023';
  end if;

  update public.academic_documents
    set processing_status = 'queued',
        processing_generation = processing_generation + 1,
        updated_at = now()
    where id = p_document_id
    returning * into document_row;

  insert into public.academic_document_processing_jobs (
    document_id, owner_id, generation
  ) values (
    document_row.id, document_row.owner_id, document_row.processing_generation
  ) returning * into job_row;

  return job_row;
end;
$$;

create function public.claim_academic_document_processing_job()
returns table (
  id uuid,
  document_id uuid,
  owner_id uuid,
  generation integer,
  attempt_count integer,
  storage_path text,
  file_size bigint,
  sha256 text,
  page_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.academic_document_processing_jobs;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker authorization required' using errcode = '42501';
  end if;

  update public.academic_document_processing_jobs as j
    set status = 'failed', error_code = 'worker_error', completed_at = now()
    where j.status = 'processing' and j.attempt_count >= 3
      and j.updated_at < now() - interval '15 minutes';
  update public.academic_document_processing_jobs as j
    set status = 'queued', progress_percent = 0
    where j.status = 'processing' and j.attempt_count < 3
      and j.updated_at < now() - interval '15 minutes';
  update public.academic_documents as d
    set processing_status = case
      when exists (
        select 1 from public.academic_document_processing_jobs as j
        where j.document_id = d.id and j.status = 'queued'
      ) then 'queued'
      else 'processing_failed'
    end,
    updated_at = now()
    where d.processing_status = 'processing'
      and not exists (
        select 1 from public.academic_document_processing_jobs as j
        where j.document_id = d.id and j.status = 'processing'
      );

  select j.* into selected_job
    from public.academic_document_processing_jobs as j
    join public.academic_documents as d on d.id = j.document_id
    where j.status = 'queued' and j.attempt_count < 3
      and d.processing_status = 'queued'
    order by j.created_at, j.id
    for update of j skip locked
    limit 1;
  if not found then
    return;
  end if;

  update public.academic_document_processing_jobs as j
    set status = 'processing',
        attempt_count = j.attempt_count + 1,
        progress_percent = 0,
        started_at = now(),
        error_code = null
    where j.id = selected_job.id
    returning * into selected_job;
  update public.academic_documents as d
    set processing_status = 'processing', updated_at = now()
    where d.id = selected_job.document_id;

  return query
    select selected_job.id, d.id, d.owner_id, selected_job.generation,
      selected_job.attempt_count, d.storage_path, d.file_size, d.sha256, d.page_count
    from public.academic_documents as d
    where d.id = selected_job.document_id;
end;
$$;

create function public.update_academic_document_processing_progress(
  p_job_id uuid,
  p_progress_percent integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker authorization required' using errcode = '42501';
  end if;
  if p_progress_percent not between 0 and 99 then
    raise exception 'Invalid progress value' using errcode = '22023';
  end if;
  update public.academic_document_processing_jobs
    set progress_percent = p_progress_percent, updated_at = now()
    where id = p_job_id and status = 'processing';
  if not found then
    raise exception 'Processing job is unavailable' using errcode = 'P0002';
  end if;
end;
$$;

create function public.save_academic_document_processing_pages(
  p_job_id uuid,
  p_pages jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.academic_document_processing_jobs;
  expected_pages integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker authorization required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_pages) <> 'array' then
    raise exception 'Invalid page results' using errcode = '22023';
  end if;

  select j.* into job_row
    from public.academic_document_processing_jobs as j
    join public.academic_documents as d on d.id = j.document_id
    where j.id = p_job_id and j.status = 'processing'
      and d.processing_status = 'processing'
    for update of j, d;
  if found then
    select d.page_count into expected_pages
      from public.academic_documents as d
      where d.id = job_row.document_id and d.owner_id = job_row.owner_id;
  end if;
  if not found then
    raise exception 'Processing job is unavailable' using errcode = 'P0002';
  end if;
  if jsonb_array_length(p_pages) <> expected_pages then
    raise exception 'The extracted page count does not match the document' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_pages) as page(page_number integer)
    where page.page_number is null or page.page_number < 1 or page.page_number > expected_pages
  ) or (
    select count(distinct page.page_number) from jsonb_to_recordset(p_pages) as page(page_number integer)
  ) <> expected_pages then
    raise exception 'Invalid page references' using errcode = '22023';
  end if;

  delete from public.academic_document_pages
    where document_id = job_row.document_id and owner_id = job_row.owner_id;
  insert into public.academic_document_pages (
    document_id, owner_id, page_number, extracted_text,
    extraction_method, extraction_status, error_code, updated_at
  )
  select job_row.document_id, job_row.owner_id, page.page_number,
    coalesce(page.extracted_text, ''), page.extraction_method,
    page.extraction_status, page.error_code, now()
  from jsonb_to_recordset(p_pages) as page(
    page_number integer,
    extracted_text text,
    extraction_method text,
    extraction_status text,
    error_code text
  );
end;
$$;

create function public.complete_academic_document_processing(
  p_job_id uuid,
  p_success boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.academic_document_processing_jobs;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Worker authorization required' using errcode = '42501';
  end if;
  if p_error_code is not null and p_error_code not in (
    'source_unavailable', 'invalid_pdf', 'page_limit_exceeded',
    'render_failed', 'ocr_failed', 'partial_page_failure', 'worker_error'
  ) then
    raise exception 'Invalid processing error code' using errcode = '22023';
  end if;

  update public.academic_document_processing_jobs
    set status = case when p_success then 'completed' else 'failed' end,
        progress_percent = case when p_success then 100 else progress_percent end,
        error_code = p_error_code,
        completed_at = now(),
        updated_at = now()
    where id = p_job_id and status = 'processing'
    returning * into job_row;
  if not found then
    raise exception 'Processing job is unavailable' using errcode = 'P0002';
  end if;

  update public.academic_documents
    set processing_status = case when p_success then 'text_extracted' else 'processing_failed' end,
        updated_at = now()
    where id = job_row.document_id and owner_id = job_row.owner_id
      and processing_status = 'processing';
  if not found then
    raise exception 'Document is unavailable' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.queue_academic_document_processing(uuid)
  from public, anon;
grant execute on function public.queue_academic_document_processing(uuid)
  to authenticated;
revoke all on function public.claim_academic_document_processing_job()
  from public, anon, authenticated;
grant execute on function public.claim_academic_document_processing_job()
  to service_role;
revoke all on function public.update_academic_document_processing_progress(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.update_academic_document_processing_progress(uuid, integer)
  to service_role;
revoke all on function public.save_academic_document_processing_pages(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_academic_document_processing_pages(uuid, jsonb)
  to service_role;
revoke all on function public.complete_academic_document_processing(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_academic_document_processing(uuid, boolean, text)
  to service_role;
