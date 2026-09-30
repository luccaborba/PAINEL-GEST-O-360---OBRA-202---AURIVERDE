insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cx-transfer-imports', 'cx-transfer-imports', false, 20971520, array['application/pdf'])
on conflict (id) do update set public=false, file_size_limit=20971520, allowed_mime_types=array['application/pdf'];

create policy cx_transfer_import_upload on storage.objects for insert to authenticated
with check (bucket_id='cx-transfer-imports' and public.cx_can_access(((storage.foldername(name))[1])::uuid,'collaborators','create'));
create policy cx_transfer_import_read on storage.objects for select to authenticated
using (bucket_id='cx-transfer-imports' and public.cx_can_access(((storage.foldername(name))[1])::uuid,'collaborators','create'));
create policy cx_transfer_import_delete on storage.objects for delete to authenticated
using (bucket_id='cx-transfer-imports' and public.cx_can_access(((storage.foldername(name))[1])::uuid,'collaborators','create'));
