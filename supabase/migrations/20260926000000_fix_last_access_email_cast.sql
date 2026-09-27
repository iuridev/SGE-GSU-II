-- Corrige get_user_last_access (20260804010000): auth.users.email é
-- varchar(255), mas a função declara a coluna como text, o que gerava o erro
-- 42804 "structure of query does not match function result type" e deixava a
-- lista de último acesso vazia em Métricas de Acesso.
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
    select au.id, au.email::text, au.last_sign_in_at, au.created_at
    from auth.users au;
end;
$$;

grant execute on function public.get_user_last_access() to authenticated;
