-- Fechamento é individual: um espelho final não bloqueia o ponto dos demais colaboradores.
create table public.cx_time_signoffs (
  project_id uuid not null,
  collaborator_id uuid not null,
  competence date not null,
  closed_at timestamptz not null default now(),
  closed_by uuid not null default auth.uid() references auth.users(id),
  primary key(project_id,collaborator_id,competence),
  foreign key(project_id,competence) references public.cx_time_periods(project_id,competence),
  foreign key(collaborator_id,project_id) references public.cx_collaborators(id,project_id)
);
alter table public.cx_time_signoffs enable row level security;
grant select,insert on public.cx_time_signoffs to authenticated;
create policy cx_time_signoffs_read on public.cx_time_signoffs for select to authenticated using(public.cx_can_access(project_id,'time_attendance','view'));
create policy cx_time_signoffs_close on public.cx_time_signoffs for insert to authenticated with check(public.cx_can_access(project_id,'time_attendance','approve') and closed_by=auth.uid());

create or replace function public.cx_time_guard() returns trigger language plpgsql set search_path='' as $$
declare v_closed boolean;
begin
  if TG_OP='UPDATE' and (new.project_id is distinct from old.project_id or new.collaborator_id is distinct from old.collaborator_id or new.work_date is distinct from old.work_date or new.competence is distinct from old.competence) then
    raise exception 'Identificação do lançamento não pode ser alterada';
  end if;
  select exists(select 1 from public.cx_time_signoffs where project_id=coalesce(new.project_id,old.project_id) and collaborator_id=coalesce(new.collaborator_id,old.collaborator_id) and competence=coalesce(new.competence,old.competence)) into v_closed;
  if v_closed then raise exception 'Espelho do colaborador fechado: lançamentos bloqueados'; end if;
  if TG_OP<>'DELETE' then
    if new.work_date < (new.competence - interval '1 month' + interval '20 days')::date or new.work_date > (new.competence + interval '19 days')::date then
      raise exception 'Data fora da competência de 21 a 20';
    end if;
    new.updated_at=now();new.changed_by=auth.uid();
  end if;
  return coalesce(new,old);
end $$;
