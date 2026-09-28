-- Preserva a identidade do v1, os estados originais e o arquivo histórico fora da API.
alter table public.cx_collaborators
  add column legacy_source_id uuid,
  add column legacy_registration text;

create unique index cx_collaborators_legacy_source_idx
  on public.cx_collaborators (legacy_source_id) where legacy_source_id is not null;

alter table public.cx_collaborators
  drop constraint cx_collaborators_status_check;
alter table public.cx_collaborators
  add constraint cx_collaborators_status_check
  check (status in ('ATIVO', 'AFASTADO', 'DESLIGADO', 'INATIVO', 'ABANDONO', 'TRANSFERIDO'));

-- Há um CPF duplicado no v1; mantemos ambos e sinalizamos para revisão posterior.
drop index if exists public.cx_collaborators_project_cpf_idx;
create index cx_collaborators_project_cpf_idx
  on public.cx_collaborators (project_id, cpf) where cpf is not null;

create schema if not exists cx_private;
revoke all on schema cx_private from public, anon, authenticated;
create table cx_private.collaborator_legacy_snapshots (
  source_id uuid primary key,
  collaborator_id uuid not null unique references public.cx_collaborators(id) on delete restrict,
  payload jsonb not null,
  imported_at timestamptz not null default now()
);
alter table cx_private.collaborator_legacy_snapshots enable row level security;
revoke all on cx_private.collaborator_legacy_snapshots from public, anon, authenticated;
