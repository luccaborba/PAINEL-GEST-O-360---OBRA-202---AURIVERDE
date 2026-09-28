-- Amplia a ficha preservando os colaboradores já cadastrados.
alter table public.cx_collaborators
  add column if not exists cpf text,
  add column if not exists contract_type text,
  add column if not exists sector text,
  add column if not exists job_level text,
  add column if not exists aso_expires_on date,
  add column if not exists work_schedule text,
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists break_start time,
  add column if not exists break_end time,
  add column if not exists shift_details text,
  add column if not exists license_number text,
  add column if not exists license_category text,
  add column if not exists license_expires_on date,
  add column if not exists salary numeric(12,2),
  add column if not exists bonus numeric(12,2),
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists travel_state text,
  add column if not exists travel_city text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists distance_km numeric(12,2),
  add column if not exists entitled_to_leave text not null default 'NÃO',
  add column if not exists last_leave_on date,
  add column if not exists next_leave_on date,
  add column if not exists leave_periodicity text,
  add column if not exists leave_cost numeric(12,2),
  add column if not exists transport_allowance numeric(12,2),
  add column if not exists benefits numeric(12,2),
  add column if not exists uses_lodging text not null default 'NÃO',
  add column if not exists lodging text;

alter table public.cx_collaborators
  add constraint cx_collaborators_cpf_format check (cpf is null or cpf ~ '^[0-9]{11}$'),
  add constraint cx_collaborators_state_format check (state is null or state ~ '^[A-Z]{2}$'),
  add constraint cx_collaborators_travel_state_format check (travel_state is null or travel_state ~ '^[A-Z]{2}$'),
  add constraint cx_collaborators_leave_flag check (entitled_to_leave in ('SIM', 'NÃO')),
  add constraint cx_collaborators_lodging_flag check (uses_lodging in ('SIM', 'NÃO')),
  add constraint cx_collaborators_amounts_positive check (
    (salary is null or salary >= 0) and (bonus is null or bonus >= 0) and
    (distance_km is null or distance_km >= 0) and (leave_cost is null or leave_cost >= 0) and
    (transport_allowance is null or transport_allowance >= 0) and (benefits is null or benefits >= 0)
  );

create unique index if not exists cx_collaborators_project_cpf_idx
  on public.cx_collaborators(project_id, cpf) where cpf is not null;
