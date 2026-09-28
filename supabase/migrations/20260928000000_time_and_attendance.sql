-- Ponto manual por obra, com marcações reais preservadas e produção em minutos.
insert into public.cx_modules(code,name,section) values ('time_attendance','Ponto e Jornada','PESSOAS')
on conflict(code) do update set name=excluded.name, section=excluded.section, enabled=true;
create unique index if not exists cx_collaborators_id_project_unique on public.cx_collaborators(id,project_id);

create table public.cx_time_schedules (
  project_id uuid not null references public.cx_projects(id) on delete restrict,
  collaborator_id uuid not null references public.cx_collaborators(id) on delete restrict,
  kind text not null check(kind in ('OBRA','ADMINISTRATIVO','VIGIA_12X36')),
  anchor_date date,
  updated_at timestamptz not null default now(),
  primary key(project_id,collaborator_id),
  foreign key(collaborator_id,project_id) references public.cx_collaborators(id,project_id),
  check(kind<>'VIGIA_12X36' or anchor_date is not null)
);
create table public.cx_time_periods (
  project_id uuid not null references public.cx_projects(id) on delete restrict,
  competence date not null check(extract(day from competence)=1),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  primary key(project_id,competence),
  check((closed_at is null)=(closed_by is null))
);
create table public.cx_time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cx_projects(id) on delete restrict,
  collaborator_id uuid not null references public.cx_collaborators(id) on delete restrict,
  work_date date not null,
  competence date not null check(extract(day from competence)=1),
  schedule_kind text not null check(schedule_kind in ('OBRA','ADMINISTRATIVO','VIGIA_12X36')),
  entry_time time,
  break_start time,
  break_end time,
  exit_time time,
  holiday boolean not null default false,
  production_minutes integer not null default 0 check(production_minutes between 0 and 1440),
  note text not null default '',
  changed_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(project_id,collaborator_id,work_date),
  foreign key(collaborator_id,project_id) references public.cx_collaborators(id,project_id),
  foreign key(project_id,competence) references public.cx_time_periods(project_id,competence),
  check ((entry_time is null and exit_time is null and break_start is null and break_end is null)
     or (entry_time is not null and exit_time is not null and (break_start is null and break_end is null or break_start is not null and break_end is not null)))
);
create index cx_time_entries_period_idx on public.cx_time_entries(project_id,competence,collaborator_id,work_date);
create table public.cx_time_entry_history (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  entry_id uuid not null,
  actor_id uuid,
  operation text not null,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);

alter table public.cx_time_schedules enable row level security;
alter table public.cx_time_periods enable row level security;
alter table public.cx_time_entries enable row level security;
alter table public.cx_time_entry_history enable row level security;
grant select,insert,update on public.cx_time_schedules, public.cx_time_periods, public.cx_time_entries to authenticated;
grant delete on public.cx_time_entries to authenticated;
grant select on public.cx_time_entry_history to authenticated;
create policy cx_time_schedules_read on public.cx_time_schedules for select to authenticated using(public.cx_can_access(project_id,'time_attendance','view'));
create policy cx_time_schedules_create on public.cx_time_schedules for insert to authenticated with check(public.cx_can_access(project_id,'time_attendance','create'));
create policy cx_time_schedules_edit on public.cx_time_schedules for update to authenticated using(public.cx_can_access(project_id,'time_attendance','edit')) with check(public.cx_can_access(project_id,'time_attendance','edit'));
create policy cx_time_periods_read on public.cx_time_periods for select to authenticated using(public.cx_can_access(project_id,'time_attendance','view'));
create policy cx_time_periods_create on public.cx_time_periods for insert to authenticated with check(public.cx_can_access(project_id,'time_attendance','create'));
create policy cx_time_periods_close on public.cx_time_periods for update to authenticated using(public.cx_can_access(project_id,'time_attendance','approve')) with check(public.cx_can_access(project_id,'time_attendance','approve'));
create policy cx_time_entries_read on public.cx_time_entries for select to authenticated using(public.cx_can_access(project_id,'time_attendance','view'));
create policy cx_time_entries_create on public.cx_time_entries for insert to authenticated with check(public.cx_can_access(project_id,'time_attendance','create'));
create policy cx_time_entries_edit on public.cx_time_entries for update to authenticated using(public.cx_can_access(project_id,'time_attendance','edit')) with check(public.cx_can_access(project_id,'time_attendance','edit'));
create policy cx_time_entries_delete on public.cx_time_entries for delete to authenticated using(public.cx_can_access(project_id,'time_attendance','delete'));
create policy cx_time_entry_history_read on public.cx_time_entry_history for select to authenticated using(public.cx_can_access(project_id,'time_attendance','view'));

create function public.cx_time_schedule_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if new.project_id is distinct from old.project_id or new.collaborator_id is distinct from old.collaborator_id then
    raise exception 'Vínculo da jornada não pode ser alterado';
  end if;
  if (new.kind,new.anchor_date) is distinct from (old.kind,old.anchor_date) and exists (
    select 1 from public.cx_time_entries e where e.project_id=old.project_id and e.collaborator_id=old.collaborator_id
  ) then raise exception 'Jornada com lançamentos registrados: preserve o histórico'; end if;
  new.updated_at=now();return new;
end $$;
create trigger cx_time_schedules_guard before update on public.cx_time_schedules for each row execute function public.cx_time_schedule_guard();

create function public.cx_time_period_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if new.project_id is distinct from old.project_id or new.competence is distinct from old.competence then
    raise exception 'Identificação da competência não pode ser alterada';
  end if;
  if old.closed_at is not null then raise exception 'Competência já fechada'; end if;
  if new.closed_at is null or new.closed_by is distinct from auth.uid() then
    raise exception 'Fechamento exige data e usuário atual';
  end if;
  return new;
end $$;
create trigger cx_time_periods_guard before update on public.cx_time_periods for each row execute function public.cx_time_period_guard();

create function public.cx_time_guard() returns trigger language plpgsql set search_path='' as $$
declare v_closed timestamptz;
begin
  if TG_OP='UPDATE' and (new.project_id is distinct from old.project_id or new.collaborator_id is distinct from old.collaborator_id or new.work_date is distinct from old.work_date or new.competence is distinct from old.competence) then
    raise exception 'Identificação do lançamento não pode ser alterada';
  end if;
  select closed_at into v_closed from public.cx_time_periods where project_id=coalesce(new.project_id,old.project_id) and competence=coalesce(new.competence,old.competence);
  if v_closed is not null then raise exception 'Competência fechada: lançamentos bloqueados'; end if;
  if TG_OP<>'DELETE' then
    if new.work_date < (new.competence - interval '1 month' + interval '20 days')::date or new.work_date > (new.competence + interval '19 days')::date then
      raise exception 'Data fora da competência de 21 a 20';
    end if;
    new.updated_at=now();new.changed_by=auth.uid();
  end if;
  return coalesce(new,old);
end $$;
create trigger cx_time_entries_guard before insert or update or delete on public.cx_time_entries for each row execute function public.cx_time_guard();
create function public.cx_time_log_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.cx_time_entry_history(project_id,entry_id,actor_id,operation,old_row,new_row)
  values(coalesce(new.project_id,old.project_id),coalesce(new.id,old.id),auth.uid(),TG_OP,to_jsonb(old),to_jsonb(new));
  return coalesce(new,old);
end $$;
revoke all on function public.cx_time_log_change() from public,anon,authenticated;
create trigger cx_time_entries_history after insert or update or delete on public.cx_time_entries for each row execute function public.cx_time_log_change();
