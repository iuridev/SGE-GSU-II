-- Complementa access_logs (20260804000000_add_access_logs.sql) para permitir
-- calcular tempo de uso por sessão na página Métricas de Acesso:
--   • session_id: gerado no navegador (sessionStorage — dura até a aba
--     fechar) e gravado em todo evento (login/page_view/logout) daquela
--     sessão, para poder agrupá-los.
--   • evento 'logout': gravado quando o usuário sai pelo botão "Sair do
--     Sistema" (ou a sessão expira), marcando o fim exato de uma sessão em
--     vez de depender só do último page_view registrado.
alter table public.access_logs add column if not exists session_id uuid;

create index if not exists access_logs_session_id_idx on public.access_logs(session_id);

-- Substitui a CHECK constraint de event_type (criada sem nome fixo na
-- migration anterior) para aceitar também 'logout'. Descobre o nome real em
-- vez de assumir a convenção padrão do Postgres, seguindo o mesmo cuidado da
-- migration 20260713010000_add_read_only_role_write_block.sql.
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.access_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format('alter table public.access_logs drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.access_logs add constraint access_logs_event_type_check
  check (event_type in ('login', 'page_view', 'logout'));
