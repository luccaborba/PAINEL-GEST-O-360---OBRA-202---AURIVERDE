create table if not exists public.cx_alert_settings (
  project_id uuid primary key references public.cx_projects(id) on delete cascade,
  experience_45 boolean not null default true,
  experience_90 boolean not null default true,
  cnh boolean not null default true,
  aso boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.cx_alert_settings enable row level security;
grant select, insert, update on public.cx_alert_settings to authenticated;
create policy cx_alert_settings_read on public.cx_alert_settings for select to authenticated
  using (public.cx_can_access(project_id, 'alerts', 'view') and public.cx_can_access(project_id, 'collaborators', 'view'));
create policy cx_alert_settings_admin_insert on public.cx_alert_settings for insert to authenticated
  with check (public.cx_is_admin(auth.uid()));
create policy cx_alert_settings_admin_update on public.cx_alert_settings for update to authenticated
  using (public.cx_is_admin(auth.uid())) with check (public.cx_is_admin(auth.uid()));
insert into public.cx_alert_settings(project_id)
select id from public.cx_projects on conflict(project_id) do nothing;
