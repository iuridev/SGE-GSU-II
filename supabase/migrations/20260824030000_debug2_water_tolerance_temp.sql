-- MIGRATION TEMPORÁRIA DE DIAGNÓSTICO (parte 2) — isola se o problema é
-- o segundo insert (admin_alert_recipients) ou já o primeiro
-- (admin_alerts) sozinho. Será removida depois.
create or replace function public.debug2_insert_alert_only(
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert_id uuid;
begin
  insert into public.admin_alerts (mensagem, criado_por, criado_por_nome)
  values ('DEBUG2 somente admin_alerts', p_created_by, 'DEBUG2')
  returning id into v_alert_id;
  return v_alert_id;
end;
$$;
