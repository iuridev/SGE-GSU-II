-- Complementa a Métricas de Acesso (ver 20260804000000_add_access_logs.sql):
-- access_logs só existe a partir de agora, mas o Supabase Auth sempre guardou
-- auth.users.last_sign_in_at. Esta função expõe esse "último acesso conhecido"
-- por usuário sem dar acesso direto ao schema auth (não exposto via API) e
-- reaplicando a mesma regra de quem pode ver métricas de acesso: todos exceto
-- school_manager.
create or replace function public.get_user_last_access()
returns table (user_id uuid, email text, last_sign_in_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('regional_admin', 'chefe_departamento', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc')
  ) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
    select au.id, au.email, au.last_sign_in_at, au.created_at
    from auth.users au;
end;
$$;

grant execute on function public.get_user_last_access() to authenticated;
