-- profiles.role é um ENUM (user_role), não uma CHECK constraint — por isso
-- a verificação defensiva da migration anterior (que só olhava pg_constraint)
-- não pegou isso, e criar um usuário com role 'chefe_departamento' falhava
-- com "invalid input value for enum user_role". Adiciona o valor ao enum.
do $$
begin
  if exists (select 1 from pg_type where typname = 'user_role') then
    alter type public.user_role add value if not exists 'chefe_departamento';
  end if;
end $$;
