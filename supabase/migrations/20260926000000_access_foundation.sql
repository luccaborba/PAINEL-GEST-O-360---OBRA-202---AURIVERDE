-- Primeira entrega Constru-X v2. Execute em projeto de teste e revise antes de produção.
create table if not exists public.cx_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  system_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.cx_projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) between 2 and 30),
  name text not null check (length(trim(name)) between 2 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.cx_modules (
  code text primary key,
  name text not null,
  section text not null,
  enabled boolean not null default true
);
create table if not exists public.cx_memberships (
  user_id uuid not null references public.cx_profiles(user_id) on delete cascade,
  project_id uuid not null references public.cx_projects(id) on delete cascade,
  active boolean not null default true,
  primary key(user_id,project_id)
);
create table if not exists public.cx_grants (
  user_id uuid not null,
  project_id uuid not null,
  module_code text not null references public.cx_modules(code) on delete cascade,
  action text not null check (action in ('view','create','edit','delete','approve','export')),
  primary key(user_id,project_id,module_code,action),
  foreign key(user_id,project_id) references public.cx_memberships(user_id,project_id) on delete cascade
);
create table if not exists public.cx_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  operation text not null,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);

-- SECURITY DEFINER avoids recursion when project/membership/grant RLS calls authorization.
create or replace function public.cx_is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cx_profiles where user_id = p_user and system_admin);
$$;
create or replace function public.cx_can_access(p_project uuid, p_module text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.cx_is_admin(auth.uid()) or exists(
      select 1 from public.cx_memberships m join public.cx_grants g
        on g.user_id=m.user_id and g.project_id=m.project_id
      where m.user_id=auth.uid() and m.project_id=p_project and m.active
        and g.module_code=p_module and g.action=p_action
    )
  );
$$;
revoke all on function public.cx_is_admin(uuid) from public;
revoke all on function public.cx_can_access(uuid,text,text) from public;
grant execute on function public.cx_is_admin(uuid), public.cx_can_access(uuid,text,text) to authenticated;

alter table public.cx_profiles enable row level security;
alter table public.cx_projects enable row level security;
alter table public.cx_modules enable row level security;
alter table public.cx_memberships enable row level security;
alter table public.cx_grants enable row level security;
alter table public.cx_access_audit enable row level security;
create policy cx_profiles_read on public.cx_profiles for select to authenticated using (user_id=auth.uid() or public.cx_is_admin());
create policy cx_profiles_admin_insert on public.cx_profiles for insert to authenticated with check (public.cx_is_admin());
create policy cx_profiles_admin_update on public.cx_profiles for update to authenticated using (public.cx_is_admin()) with check (public.cx_is_admin());
create policy cx_projects_read on public.cx_projects for select to authenticated using (public.cx_is_admin() or exists(select 1 from public.cx_memberships m where m.project_id=id and m.user_id=auth.uid() and m.active));
create policy cx_projects_admin_insert on public.cx_projects for insert to authenticated with check (public.cx_is_admin());
create policy cx_projects_admin_update on public.cx_projects for update to authenticated using (public.cx_is_admin()) with check (public.cx_is_admin());
create policy cx_modules_read on public.cx_modules for select to authenticated using (true);
create policy cx_memberships_read on public.cx_memberships for select to authenticated using (public.cx_is_admin() or user_id=auth.uid());
create policy cx_memberships_admin_insert on public.cx_memberships for insert to authenticated with check (public.cx_is_admin());
create policy cx_memberships_admin_update on public.cx_memberships for update to authenticated using (public.cx_is_admin()) with check (public.cx_is_admin());
create policy cx_memberships_admin_delete on public.cx_memberships for delete to authenticated using (public.cx_is_admin());
create policy cx_grants_read on public.cx_grants for select to authenticated using (public.cx_is_admin() or user_id=auth.uid());
create policy cx_grants_admin_insert on public.cx_grants for insert to authenticated with check (public.cx_is_admin());
create policy cx_grants_admin_delete on public.cx_grants for delete to authenticated using (public.cx_is_admin());
create policy cx_access_audit_admin_read on public.cx_access_audit for select to authenticated using (public.cx_is_admin());

create or replace function public.cx_log_access_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cx_access_audit(actor_id,table_name,operation,old_row,new_row)
  values(auth.uid(),TG_TABLE_NAME,TG_OP,to_jsonb(old),to_jsonb(new));
  return coalesce(new,old);
end; $$;
create trigger cx_audit_projects after insert or update or delete on public.cx_projects for each row execute function public.cx_log_access_change();
create trigger cx_audit_memberships after insert or update or delete on public.cx_memberships for each row execute function public.cx_log_access_change();
create trigger cx_audit_grants after insert or update or delete on public.cx_grants for each row execute function public.cx_log_access_change();
create trigger cx_audit_profiles after insert or update or delete on public.cx_profiles for each row execute function public.cx_log_access_change();

insert into public.cx_modules(code,name,section) values
('collaborators','Colaboradores','PESSOAS'),('housing','Alojamentos','PESSOAS'),
('field_leave','Folgas de Campo','PESSOAS'),('reimbursements','Reembolsos','PESSOAS'),
('contracts','Contratos','CONTRATOS'),('assets','Patrimônio','PATRIMÔNIO'),
('safety','SESMT','SESMT'),('closing','Fechamento de Praça','FINANCEIRO')
on conflict(code) do nothing;

-- Aplicar depois cx_can_access para cada operação nas tabelas de negócio migradas.
-- Exemplo: CREATE POLICY ... ON public.funcionarios FOR SELECT TO authenticated
-- USING (public.cx_can_access(obra_id, 'collaborators', 'view'));
