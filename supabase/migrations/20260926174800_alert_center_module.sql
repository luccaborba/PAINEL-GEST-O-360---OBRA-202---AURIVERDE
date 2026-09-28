-- A Central de Alertas usa somente os campos dos colaboradores já protegidos por RLS.
-- Para usuários comuns, o painel exige acesso de leitura a colaboradores e à central.
insert into public.cx_modules (code, name, section, enabled)
values ('alerts', 'Central de Alertas', 'PESSOAS', true)
on conflict (code) do update
set name = excluded.name, section = excluded.section, enabled = excluded.enabled;
