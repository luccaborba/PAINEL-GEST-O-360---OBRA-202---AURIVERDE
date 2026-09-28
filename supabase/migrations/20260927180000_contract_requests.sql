-- Solicitações de contratos por obra, com autorização por ação.
insert into public.cx_modules(code,name,section) values
  ('contract_requests','Solicitações de Contratos','CONTRATOS')
on conflict(code) do update set name=excluded.name,section=excluded.section,enabled=true;

create table if not exists public.cx_contract_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cx_projects(id) on delete restrict,
  form_type text not null check(form_type in ('aditivo','distrato','locacao_equipamento','locacao_imovel','locacao_veiculo','prestacao_servicos')),
  form_data jsonb not null default '{}'::jsonb check(jsonb_typeof(form_data)='object'),
  status text not null default 'RASCUNHO' check(status in ('RASCUNHO','ENVIADA')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cx_contract_requests_project_date on public.cx_contract_requests(project_id,created_at desc);
alter table public.cx_contract_requests enable row level security;
grant select,insert,update,delete on public.cx_contract_requests to authenticated;
create policy cx_contract_requests_view on public.cx_contract_requests for select to authenticated
  using(public.cx_can_access(project_id,'contract_requests','view'));
create policy cx_contract_requests_create on public.cx_contract_requests for insert to authenticated
  with check(public.cx_can_access(project_id,'contract_requests','create') and created_by=auth.uid());
create policy cx_contract_requests_edit on public.cx_contract_requests for update to authenticated
  using(public.cx_can_access(project_id,'contract_requests','edit'))
  with check(public.cx_can_access(project_id,'contract_requests','edit'));
create policy cx_contract_requests_delete on public.cx_contract_requests for delete to authenticated
  using(public.cx_can_access(project_id,'contract_requests','delete'));

create or replace function public.cx_contract_request_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Origem da solicitação não pode ser alterada';
  end if;
  new.updated_at=now();
  return new;
end $$;
create trigger cx_contract_request_guard before update on public.cx_contract_requests
  for each row execute function public.cx_contract_request_guard();
