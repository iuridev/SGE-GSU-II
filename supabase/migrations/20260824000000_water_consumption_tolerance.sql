-- Tolerância de excesso esporádico no consumo de água: escolas que
-- estouram o limite diário por até 3 m³ não precisam preencher
-- justificativa/ação — é tolerado automaticamente e o dia fica marcado
-- como "esporádico" (cor laranja no calendário). Ao acumular 4 dias
-- assim no mês, a escola recebe um alerta de conscientização. Ao
-- acumular 8, a tolerância se esgota pro resto do mês: a partir daí
-- todo excesso (mesmo dentro da margem) volta a exigir justificativa
-- e ação, como já era antes desta migration.
--
-- Toda a regra fica num trigger BEFORE INSERT/UPDATE (não no frontend)
-- porque: (1) precisa ser atômica com a contagem de dias do mês, sem
-- depender do cache local do cliente; (2) precisa poder inserir em
-- admin_alerts, que só admin/supervisor podem inserir via RLS — a
-- escola (school_manager) que está salvando o próprio consumo não
-- pode, então a função roda como SECURITY DEFINER; (3) assim a regra
-- vale igual em todos os caminhos de escrita (registro normal e a
-- cascata de recálculo de dias futuros em handleSave).
--
-- ATENÇÃO: o valor 0.009 (litros por pessoa/dia convertido pra m³) e a
-- margem 3 (m³) abaixo precisam ficar em sincronia com as constantes
-- LIMITE_DIARIO_POR_PESSOA e MARGEM_TOLERANCIA_ESPORADICA em
-- src/pages/ConsumoAgua.tsx — o trigger é quem decide de fato, o
-- frontend só usa esses mesmos valores pra mostrar uma prévia coerente
-- antes de salvar.

alter table public.consumo_agua
  add column if not exists is_sporadic_excess boolean not null default false;

comment on column public.consumo_agua.is_sporadic_excess is
  'Excesso diário dentro da margem de tolerância (até 3 m³ acima do limite), tolerado automaticamente sem exigir justificativa/ação. Definido pelo trigger trg_water_tolerance, não pelo cliente.';

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
end;
$$;

create or replace function public.handle_water_tolerance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  daily_limit numeric;
  sporadic_days_before integer;
  date_already_counted boolean;
  new_total integer;
begin
  -- Dia sem excesso (ou primeira leitura/suspensão, que já vêm com
  -- limit_exceeded = false do frontend): nada a tolerar.
  if NEW.limit_exceeded is not true then
    NEW.is_sporadic_excess := false;
    return NEW;
  end if;

  daily_limit := (coalesce(NEW.student_count, 0) + coalesce(NEW.staff_count, 0)) * 0.009;

  -- Fora da margem de 3 m³: excesso "severo", comportamento inalterado
  -- (exige justificativa/ação, já validado no frontend antes de chegar aqui).
  if NEW.consumption_diff > daily_limit + 3 then
    NEW.is_sporadic_excess := false;
    return NEW;
  end if;

  -- Dentro da margem: conta quantos dias distintos já foram tolerados
  -- neste mês pra essa escola (excluindo a própria linha, importante no
  -- UPDATE — em multi-hidrômetro pode haver mais de uma linha por dia).
  select count(distinct date) into sporadic_days_before
  from public.consumo_agua
  where school_id = NEW.school_id
    and is_sporadic_excess = true
    and date_trunc('month', date) = date_trunc('month', NEW.date)
    and id <> NEW.id;

  if sporadic_days_before >= 8 then
    -- Tolerância esgotada neste mês: volta a exigir justificativa/ação.
    -- Rejeita aqui como rede de segurança caso o preview do cliente
    -- (calculado a partir do allMonthLogs em cache) esteja desatualizado.
    if NEW.justification is null or btrim(NEW.justification) = ''
       or NEW.action_plan is null or btrim(NEW.action_plan) = '' then
      raise exception 'Sua escola já utilizou a tolerância de excesso esporádico este mês (8 dias). Preencha justificativa e ação para este excesso.';
    end if;
    NEW.is_sporadic_excess := false;
    return NEW;
  end if;

  -- Tolerado automaticamente.
  NEW.is_sporadic_excess := true;
  NEW.justification := 'Excesso de consumo esporádico';
  NEW.action_plan := null;

  select exists(
    select 1 from public.consumo_agua
    where school_id = NEW.school_id
      and is_sporadic_excess = true
      and date = NEW.date
      and id <> NEW.id
  ) into date_already_counted;

  if not date_already_counted then
    new_total := sporadic_days_before + 1;
    if new_total = 4 or new_total = 8 then
      perform public.create_water_tolerance_alert(NEW.school_id, NEW.created_by, new_total);
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_water_tolerance on public.consumo_agua;
create trigger trg_water_tolerance
  before insert or update on public.consumo_agua
  for each row execute function public.handle_water_tolerance();
