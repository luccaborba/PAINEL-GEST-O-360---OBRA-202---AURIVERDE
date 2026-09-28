-- Point entry staff can read their own submissions; managers with edit access
-- may inspect the certificates of their project. Existing portal rules remain.
drop policy cx_employee_documents_time_read on public.cx_employee_documents;
create policy cx_employee_documents_time_read on public.cx_employee_documents
  for select to authenticated using (
    kind = 'ATESTADO' and exists (
      select 1 from public.cx_collaborators c
      where c.id = collaborator_id
        and (public.cx_can_access(c.project_id, 'time_attendance', 'edit')
          or (uploaded_by = (select auth.uid())
              and public.cx_can_access(c.project_id, 'time_attendance', 'create')))
    )
  );

drop policy cx_employee_files_time_read on storage.objects;
create policy cx_employee_files_time_read on storage.objects
  for select to authenticated using (
    bucket_id = 'cx-employee-private'
    and (storage.foldername(name))[1] = 'atestados'
    and exists (
      select 1 from public.cx_collaborators c
      where c.id::text = (storage.foldername(name))[2]
        and (public.cx_can_access(c.project_id, 'time_attendance', 'edit')
          or (owner_id = (select auth.uid())::text
              and public.cx_can_access(c.project_id, 'time_attendance', 'create')))
    )
  );
