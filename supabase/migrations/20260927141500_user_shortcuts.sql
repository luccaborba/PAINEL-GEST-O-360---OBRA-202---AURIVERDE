-- Preferências de atalhos por usuário e obra; não concedem acesso a módulos.
create table if not exists public.cx_user_shortcuts (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.cx_projects(id) on delete cascade,
  module_codes text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id),
  constraint cx_user_shortcuts_max_count check (cardinality(module_codes) <= 10)
);
alter table public.cx_user_shortcuts enable row level security;
create policy cx_user_shortcuts_select on public.cx_user_shortcuts
  for select to authenticated using (user_id = (select auth.uid()));
create policy cx_user_shortcuts_insert on public.cx_user_shortcuts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy cx_user_shortcuts_update on public.cx_user_shortcuts
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update on public.cx_user_shortcuts to authenticated;
