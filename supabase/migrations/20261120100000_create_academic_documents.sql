create table public.academic_documents (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  filename text not null,
  content_type text not null default 'application/pdf',
  file_size bigint not null,
  sha256 text not null,
  page_count integer not null,
  storage_path text not null unique,
  processing_status text not null default 'uploading',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_documents_id_owner_key unique (id, owner_id),
  constraint academic_documents_owner_sha256_key unique (owner_id, sha256),
  constraint academic_documents_subject_owner_fkey
    foreign key (subject_id, owner_id)
    references public.subjects (id, user_id)
    on delete set null (subject_id),
  constraint academic_documents_filename_length_check
    check (char_length(filename) between 1 and 255),
  constraint academic_documents_content_type_check
    check (content_type = 'application/pdf'),
  constraint academic_documents_file_size_check
    check (file_size between 1 and 20971520),
  constraint academic_documents_sha256_check
    check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint academic_documents_page_count_check
    check (page_count between 1 and 200),
  constraint academic_documents_processing_status_check
    check (processing_status in ('uploading', 'uploaded', 'upload_failed', 'deletion_pending'))
);

create index academic_documents_owner_created_idx
  on public.academic_documents (owner_id, created_at desc, id);

alter table public.academic_documents enable row level security;
revoke all on table public.academic_documents from public, anon, authenticated;
grant select on table public.academic_documents to authenticated;

create policy "Academic documents are readable by their owner"
  on public.academic_documents
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create function public.register_academic_document(
  p_id uuid,
  p_subject_id uuid,
  p_filename text,
  p_file_size bigint,
  p_sha256 text,
  p_page_count integer,
  p_storage_path text
)
returns public.academic_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.academic_documents;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_storage_path <> auth.uid()::text || '/' || p_id::text || '.pdf' then
    raise exception 'Invalid document storage path' using errcode = '22023';
  end if;

  insert into public.academic_documents (
    id, owner_id, subject_id, filename, file_size, sha256, page_count, storage_path
  ) values (
    p_id, auth.uid(), p_subject_id, p_filename, p_file_size, p_sha256,
    p_page_count, p_storage_path
  ) returning * into result;

  return result;
end;
$$;

create function public.mark_academic_document_deletion_pending(p_id uuid)
returns public.academic_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.academic_documents;
begin
  update public.academic_documents
    set processing_status = 'deletion_pending', updated_at = now()
    where id = p_id and owner_id = auth.uid()
    returning * into result;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create function public.set_academic_document_upload_status(p_id uuid, p_status text)
returns public.academic_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.academic_documents;
begin
  if p_status not in ('uploaded', 'upload_failed') then
    raise exception 'Invalid document status' using errcode = '22023';
  end if;
  update public.academic_documents
    set processing_status = p_status, updated_at = now()
    where id = p_id and owner_id = auth.uid()
      and processing_status in ('uploading', 'upload_failed');
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  select * into result from public.academic_documents
    where id = p_id and owner_id = auth.uid();
  return result;
end;
$$;

create function public.complete_academic_document_deletion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.academic_documents
    where id = p_id and owner_id = auth.uid()
      and processing_status = 'deletion_pending';
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.register_academic_document(uuid, uuid, text, bigint, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.mark_academic_document_deletion_pending(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_academic_document_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.set_academic_document_upload_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_academic_document(uuid, uuid, text, bigint, text, integer, text)
  to authenticated;
grant execute on function public.mark_academic_document_deletion_pending(uuid)
  to authenticated;
grant execute on function public.complete_academic_document_deletion(uuid)
  to authenticated;
grant execute on function public.set_academic_document_upload_status(uuid, text)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academic-documents', 'academic-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners can upload academic documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'academic-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners can read academic documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'academic-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners can delete academic documents"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'academic-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create trigger academic_documents_set_updated_at
  before update on public.academic_documents
  for each row execute function public.touch_academic_updated_at();
