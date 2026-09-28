-- Colunas do lançamento resumido em grupo. Marcações de entrada e saída permanecem intactas.
alter table public.cx_collaborators add column if not exists foreman text;
alter table public.cx_time_entries
  add column if not exists attendance_status text not null default 'PRESENTE',
  add column if not exists worked_minutes_override integer,
  add column if not exists extra_minutes_override integer;

alter table public.cx_time_entries
  add constraint cx_time_attendance_status_check check (attendance_status in ('PRESENTE','FALTA','FOLGA','ATESTADO','12X36')),
  add constraint cx_time_worked_override_check check (worked_minutes_override between 0 and 1440),
  add constraint cx_time_extra_override_check check (extra_minutes_override between 0 and 1440);
