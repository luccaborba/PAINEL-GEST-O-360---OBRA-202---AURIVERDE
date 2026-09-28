create table if not exists public.cx_contract_dashboard_settings (
  project_id uuid primary key references public.cx_projects(id) on delete cascade,
  selected_types text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);
alter table public.cx_contract_dashboard_settings enable row level security;
grant select, insert, update on public.cx_contract_dashboard_settings to authenticated;
create policy cx_contract_dashboard_settings_read on public.cx_contract_dashboard_settings for select to authenticated
  using (public.cx_can_access(project_id, 'contracts', 'view'));
create policy cx_contract_dashboard_settings_insert on public.cx_contract_dashboard_settings for insert to authenticated
  with check (public.cx_is_admin(auth.uid()));
create policy cx_contract_dashboard_settings_update on public.cx_contract_dashboard_settings for update to authenticated
  using (public.cx_is_admin(auth.uid())) with check (public.cx_is_admin(auth.uid()));
