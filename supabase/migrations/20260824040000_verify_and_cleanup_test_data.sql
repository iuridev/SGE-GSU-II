-- Verificação + limpeza dos dados de teste da investigação do trigger de
-- tolerância de consumo de água. A suspeita: os inserts de teste sempre
-- funcionaram; o que parecia "não persistir" era a policy de SELECT em
-- admin_alerts, que só vale `to authenticated` — as verificações usaram a
-- anon key sem login, então nunca enxergavam as linhas (RLS nega por
-- padrão pra quem não bate em nenhuma policy). Esta migration roda com
-- privilégio total (conexão direta de migration, sem RLS) pra confirmar
-- isso e apagar tudo que sobrou dos testes.
do $$
declare
  v_test_school_id uuid := '237cd2a6-c79b-410a-947b-cf1d444a40d9';
  v_count integer;
  v_alert_ids uuid[];
begin
  select count(*) into v_count
  from public.admin_alerts
  where criado_por_nome in ('Sistema — Consumo de Água', 'DEBUG Sistema', 'DEBUG2')
     or mensagem like '%excesso esporádico%'
     or mensagem like 'DEBUG%';

  raise notice 'Alertas de teste encontrados (bypassando RLS): %', v_count;

  select array_agg(id) into v_alert_ids
  from public.admin_alerts
  where criado_por_nome in ('Sistema — Consumo de Água', 'DEBUG Sistema', 'DEBUG2')
     or mensagem like '%excesso esporádico%'
     or mensagem like 'DEBUG%';

  if v_alert_ids is not null then
    delete from public.admin_alert_recipients where alert_id = any(v_alert_ids);
    delete from public.admin_alerts where id = any(v_alert_ids);
    raise notice 'Removidos % alertas de teste e seus destinatários.', array_length(v_alert_ids, 1);
  end if;

  delete from public.consumo_agua
  where school_id = v_test_school_id
    and date between '2019-03-01' and '2019-03-31';
  raise notice 'Linhas de teste em consumo_agua (mês 2019-03) removidas.';
end $$;

drop function if exists public.debug2_insert_alert_only(uuid);
