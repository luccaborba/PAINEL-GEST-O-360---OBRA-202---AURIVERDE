-- Patrimônio por obra: cadastro, locais próprios e alocação em imóveis ou locais.
create table public.cx_asset_catalog (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cx_projects(id),
  code text not null check (length(trim(code)) between 1 and 40),
  description text not null check (length(trim(description)) between 2 and 200),
  unit text not null default 'UN',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, code), unique (project_id, id)
);
create table public.cx_asset_locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cx_projects(id),
  name text not null check (length(trim(name)) between 2 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, name), unique (project_id, id)
);
alter table public.cx_housing add constraint cx_housing_project_id_id_key unique (project_id, id);
create table public.cx_asset_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cx_projects(id),
  item_id uuid not null,
  housing_id uuid,
  location_id uuid,
  contract_code text,
  quantity numeric(12,2) not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, item_id) references public.cx_asset_catalog(project_id, id),
  foreign key (project_id, location_id) references public.cx_asset_locations(project_id, id),
  foreign key (project_id, housing_id) references public.cx_housing(project_id, id),
  foreign key (project_id, contract_code) references public.cx_contracts(project_id, code),
  check ((housing_id is not null)::int + (location_id is not null)::int + (contract_code is not null)::int = 1)
);
create index cx_asset_allocations_project_idx on public.cx_asset_allocations(project_id);
alter table public.cx_asset_catalog enable row level security;
alter table public.cx_asset_locations enable row level security;
alter table public.cx_asset_allocations enable row level security;
create policy cx_asset_catalog_read on public.cx_asset_catalog for select to authenticated using (public.cx_can_access(project_id,'assets','view'));
create policy cx_asset_catalog_create on public.cx_asset_catalog for insert to authenticated with check (public.cx_can_access(project_id,'assets','create'));
create policy cx_asset_catalog_edit on public.cx_asset_catalog for update to authenticated using (public.cx_can_access(project_id,'assets','edit')) with check (public.cx_can_access(project_id,'assets','edit'));
create policy cx_asset_locations_read on public.cx_asset_locations for select to authenticated using (public.cx_can_access(project_id,'assets','view'));
create policy cx_asset_locations_create on public.cx_asset_locations for insert to authenticated with check (public.cx_can_access(project_id,'assets','create'));
create policy cx_asset_locations_edit on public.cx_asset_locations for update to authenticated using (public.cx_can_access(project_id,'assets','edit')) with check (public.cx_can_access(project_id,'assets','edit'));
create policy cx_asset_allocations_read on public.cx_asset_allocations for select to authenticated using (public.cx_can_access(project_id,'assets','view'));
create policy cx_asset_allocations_create on public.cx_asset_allocations for insert to authenticated with check (public.cx_can_access(project_id,'assets','create'));
create policy cx_asset_allocations_edit on public.cx_asset_allocations for update to authenticated using (public.cx_can_access(project_id,'assets','edit')) with check (public.cx_can_access(project_id,'assets','edit'));
create policy cx_asset_allocations_delete on public.cx_asset_allocations for delete to authenticated using (public.cx_can_access(project_id,'assets','delete'));
grant select, insert, update on public.cx_asset_catalog, public.cx_asset_locations to authenticated;
grant select, insert, update, delete on public.cx_asset_allocations to authenticated;
-- O módulo de patrimônio precisa listar os imóveis e contratos da mesma obra,
-- mesmo quando o usuário não possui os módulos de alojamento/contratos.
create policy cx_housing_assets_read on public.cx_housing for select to authenticated
  using (public.cx_can_access(project_id,'assets','view'));
create policy cx_contracts_assets_read on public.cx_contracts for select to authenticated
  using (public.cx_can_access(project_id,'assets','view'));
