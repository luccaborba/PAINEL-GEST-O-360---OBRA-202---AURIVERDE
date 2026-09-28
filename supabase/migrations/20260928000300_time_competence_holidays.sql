create table public.cx_time_holidays (
  project_id uuid not null,
  competence date not null,
  holiday_date date not null,
  name text not null check (length(trim(name)) between 2 and 120),
  primary key (project_id, holiday_date),
  foreign key (project_id, competence) references public.cx_time_periods(project_id, competence) on delete cascade,
  check (holiday_date >= (competence - interval '1 month' + interval '20 days')::date
     and holiday_date <= (competence + interval '19 days')::date)
);
alter table public.cx_time_holidays enable row level security;
grant select, insert, delete on public.cx_time_holidays to authenticated;
create policy cx_time_holidays_read on public.cx_time_holidays for select to authenticated
  using (public.cx_can_access(project_id, 'time_attendance', 'view'));
create policy cx_time_holidays_create on public.cx_time_holidays for insert to authenticated
  with check (public.cx_can_access(project_id, 'time_attendance', 'create'));
create policy cx_time_holidays_delete on public.cx_time_holidays for delete to authenticated
  using (public.cx_can_access(project_id, 'time_attendance', 'edit'));
