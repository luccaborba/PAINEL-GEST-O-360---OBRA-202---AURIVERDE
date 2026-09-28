-- Funções auxiliares das políticas não devem ser chamadas pelo papel anônimo.
revoke all on function public.cx_is_admin(uuid) from public, anon;
revoke all on function public.cx_can_access(uuid,text,text) from public, anon;
revoke all on function public.cx_log_access_change() from public, anon, authenticated;
grant execute on function public.cx_is_admin(uuid), public.cx_can_access(uuid,text,text) to authenticated;
