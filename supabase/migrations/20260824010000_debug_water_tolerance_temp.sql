-- MIGRATION TEMPORÁRIA DE DIAGNÓSTICO — será substituída/removida depois de
-- identificar por que create_water_tolerance_alert não está inserindo em
-- admin_alerts. Não faz parte da feature final.
create or replace function public.debug_create_water_tolerance_alert(
  p_school_id uuid,
  p_created_by uuid,
  p_count integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert_id uuid;
  v_msg text;
begin
  if p_count = 4 then
    v_msg := 'DEBUG alerta 4';
  else
    v_msg := 'DEBUG alerta 8';
  end if;

  insert into public.admin_alerts (mensagem, criado_por, criado_por_nome)
  values (v_msg, p_created_by, 'DEBUG Sistema')
  returning id into v_alert_id;

  insert into public.admin_alert_recipients (alert_id, school_id)
  values (v_alert_id, p_school_id);

  return 'OK: alert_id=' || v_alert_id::text;
exception when others then
  return 'ERRO: ' || SQLSTATE || ' - ' || SQLERRM;
end;
$$;
