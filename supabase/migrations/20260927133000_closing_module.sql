create table if not exists public.cx_closing (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cx_projects(id) on delete cascade,
  legacy_id uuid unique,
  contract_id uuid references public.cx_contracts(id) on delete set null,
  contract_code text not null,
  supplier text not null default '',
  competence date not null,
  measurement_number text,
  measured_amount numeric(16,2) not null default 0 check (measured_amount >= 0),
  gross_amount numeric(16,2),
  discounts numeric(16,2) not null default 0,
  impacts_balance boolean not null default false,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','LANCADO','TITULO_GERADO')),
  sienge_entry_date date,
  sienge_id text,
  title_number text,
  justification text,
  notes text,
  supplier_code text,
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,competence,contract_code)
);
create index if not exists cx_closing_project_competence on public.cx_closing(project_id,competence desc);
alter table public.cx_closing enable row level security;
create policy cx_closing_read on public.cx_closing for select to authenticated using (public.cx_can_access(project_id,'closing','view'));
create policy cx_closing_create on public.cx_closing for insert to authenticated with check (public.cx_can_access(project_id,'closing','create'));
create policy cx_closing_edit on public.cx_closing for update to authenticated using (public.cx_can_access(project_id,'closing','edit')) with check (public.cx_can_access(project_id,'closing','edit'));
create policy cx_closing_delete on public.cx_closing for delete to authenticated using (public.cx_can_access(project_id,'closing','delete'));
grant select,insert,update,delete on public.cx_closing to authenticated;
