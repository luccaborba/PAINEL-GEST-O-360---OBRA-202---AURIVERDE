-- Segunda etapa: cadastro de colaboradores isolado por obra e ação.
create table if not exists public.cx_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cx_projects(id) on delete restrict,
  registration text not null,
  name text not null,
  role text,
  department text,
  hired_on date,
  terminated_on date,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'AFASTADO', 'DESLIGADO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, registration),
  check (length(trim(registration)) between 1 and 40),
  check (length(trim(name)) between 2 and 200),
  check (terminated_on is null or hired_on is null or terminated_on >= hired_on)
);

create index if not exists cx_collaborators_project_name_idx
  on public.cx_collaborators (project_id, name);

alter table public.cx_collaborators enable row level security;
create policy cx_collaborators_select on public.cx_collaborators
  for select to authenticated
  using (public.cx_can_access(project_id, 'collaborators', 'view'));
create policy cx_collaborators_insert on public.cx_collaborators
  for insert to authenticated
  with check (public.cx_can_access(project_id, 'collaborators', 'create'));
create policy cx_collaborators_update on public.cx_collaborators
  for update to authenticated
  using (public.cx_can_access(project_id, 'collaborators', 'edit'))
  with check (public.cx_can_access(project_id, 'collaborators', 'edit'));
create policy cx_collaborators_delete on public.cx_collaborators
  for delete to authenticated
  using (public.cx_can_access(project_id, 'collaborators', 'delete'));

grant select, insert, update, delete on public.cx_collaborators to authenticated;

create or replace function public.cx_collaborators_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end; $$;
create trigger cx_collaborators_updated_at before update on public.cx_collaborators
  for each row execute function public.cx_collaborators_set_updated_at();
create trigger cx_audit_collaborators after insert or update or delete on public.cx_collaborators
  for each row execute function public.cx_log_access_change();
