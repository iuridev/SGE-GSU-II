-- Papel somente-leitura (chefe_departamento): enxerga a rede como um
-- regional_admin (front-end trata os dois como equivalentes), mas nunca
-- pode escrever nada. Esta migration garante isso de verdade no banco,
-- não só na interface.

-- 1) Trava de segurança: se profiles.role tiver uma CHECK constraint que não
--    inclua 'chefe_departamento', aborta a migration com uma mensagem clara
--    em vez de aplicar algo às cegas. Nenhuma constraint desse tipo foi
--    encontrada em nenhuma migration rastreada neste repositório, mas pode
--    ter sido criada direto no painel do Supabase.
do $$
declare
  con record;
begin
  for con in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    if con.def not ilike '%chefe_departamento%' then
      raise exception
        'A constraint "%" em profiles.role (%) não inclui ''chefe_departamento''. '
        'Ajuste-a manualmente antes de reaplicar esta migration.',
        con.conname, con.def;
    end if;
  end loop;
end $$;

-- 2) Função que bloqueia qualquer escrita feita por um usuário
--    chefe_departamento, não importa a tabela.
create or replace function public.block_write_for_readonly_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from profiles where id = auth.uid() and role = 'chefe_departamento'
  ) then
    raise exception 'Acesso somente leitura: escrita não permitida para este usuário.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- 3) Anexa a trigger em todas as tabelas do schema public (cobre as ~47
--    tabelas existentes hoje; novas tabelas precisarão de uma migration
--    futura para receber a mesma proteção).
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop trigger if exists trg_block_write_readonly on public.%I', t.tablename);
    execute format(
      'create trigger trg_block_write_readonly before insert or update or delete on public.%I for each row execute function public.block_write_for_readonly_roles()',
      t.tablename
    );
  end loop;
end $$;
