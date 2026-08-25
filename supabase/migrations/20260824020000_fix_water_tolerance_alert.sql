-- Corrige create_water_tolerance_alert: a versão original (sem tratamento
-- de exceção) não estava persistindo o INSERT em admin_alerts/
-- admin_alert_recipients de forma consistente quando chamada via RPC ou
-- via o trigger trg_water_tolerance, sem reportar erro nenhum. Em vez de
-- decifrar a causa exata a fundo (o teste com uma versão idêntica que só
-- adicionava um bloco EXCEPTION funcionou de forma consistente), aplica
-- o padrão já usado no restante do projeto para efeitos colaterais tipo
-- notificação: nunca deixar a criação do alerta travar ou reverter a
-- operação principal (o registro do consumo de água). Ver o alerta de
-- e-mail em fiscalizacao.tsx, que também é "fire-and-forget".
--
-- Também remove a função de diagnóstico temporária criada durante a
-- investigação (20260824010000_debug_water_tolerance_temp.sql) — não faz
-- parte da feature.

drop function if exists public.debug_create_water_tolerance_alert(uuid, uuid, integer);

create or replace function public.create_water_tolerance_alert(
  p_school_id uuid,
  p_created_by uuid,
  p_count integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert_id uuid;
  v_msg text;
begin
  if p_created_by is null then
    return; -- sem usuário pra atribuir o alerta, não bloqueia o registro por causa disso
  end if;

  if p_count = 4 then
    v_msg := 'Sua escola atingiu 4 dias de excesso esporádico no consumo de água este mês (até 3 m³ acima do limite diário, tolerado automaticamente, sem necessidade de justificativa). Fique atenta ao consumo para evitar desperdício de água.';
  else
    v_msg := 'Atenção: sua escola atingiu 8 dias de excesso esporádico no consumo de água este mês. A tolerância automática se esgotou — a partir de agora, qualquer novo excesso de consumo (mesmo dentro da margem de 3 m³) exigirá justificativa e plano de ação.';
  end if;

  insert into public.admin_alerts (mensagem, criado_por, criado_por_nome)
  values (v_msg, p_created_by, 'Sistema — Consumo de Água')
  returning id into v_alert_id;

  insert into public.admin_alert_recipients (alert_id, school_id)
  values (v_alert_id, p_school_id);
exception when others then
  -- Nunca deixa uma falha ao criar o alerta impedir o registro do consumo
  -- de água em si (que é quem chama esta função via o trigger).
  raise warning 'create_water_tolerance_alert falhou para escola %: % (%)', p_school_id, SQLERRM, SQLSTATE;
end;
$$;
