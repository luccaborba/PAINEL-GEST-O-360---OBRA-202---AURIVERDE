-- Medical certificates are held in the existing private employee dossier.
alter table public.cx_employee_documents add column work_date date;
create index cx_employee_documents_attendance_idx
  on public.cx_employee_documents (collaborator_id, work_date)
  where kind = 'ATESTADO' and work_date is not null;

create policy cx_employee_documents_time_read on public.cx_employee_documents
  for select to authenticated using (
    kind = 'ATESTADO' and exists (
      select 1 from public.cx_collaborators c
      where c.id = collaborator_id
        and (public.cx_can_access(c.project_id, 'time_attendance', 'create')
          or public.cx_can_access(c.project_id, 'time_attendance', 'edit'))
    )
  );
create policy cx_employee_documents_time_insert on public.cx_employee_documents
  for insert to authenticated with check (
    kind = 'ATESTADO' and uploaded_by = (select auth.uid())
    and storage_path like 'atestados/' || collaborator_id::text || '/%'
    and exists (
      select 1 from public.cx_collaborators c
      where c.id = collaborator_id
        and (public.cx_can_access(c.project_id, 'time_attendance', 'create')
          or public.cx_can_access(c.project_id, 'time_attendance', 'edit'))
    )
  );

create policy cx_employee_files_time_read on storage.objects
  for select to authenticated using (
    bucket_id = 'cx-employee-private'
    and (storage.foldername(name))[1] = 'atestados'
    and exists (
      select 1 from public.cx_collaborators c
      where c.id::text = (storage.foldername(name))[2]
        and (public.cx_can_access(c.project_id, 'time_attendance', 'create')
          or public.cx_can_access(c.project_id, 'time_attendance', 'edit'))
    )
  );
create policy cx_employee_files_time_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'cx-employee-private'
    and (storage.foldername(name))[1] = 'atestados'
    and exists (
      select 1 from public.cx_collaborators c
      where c.id::text = (storage.foldername(name))[2]
        and (public.cx_can_access(c.project_id, 'time_attendance', 'create')
          or public.cx_can_access(c.project_id, 'time_attendance', 'edit'))
    )
  );
