-- Exibir endereço de contato no cadastro de usuários; privilégios continuam restritos por RLS.
alter table public.cx_profiles add column if not exists email text;
update public.cx_profiles p set email=lower(u.email)
from auth.users u where u.id=p.user_id and p.email is distinct from lower(u.email);
