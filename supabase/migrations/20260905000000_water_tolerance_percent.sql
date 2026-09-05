-- Tolerância de excesso esporádico agora é proporcional, não mais um teto fixo.
--
-- ANTES: um dia que estourava o limite diário por até 3 m³ (fixos) era
-- tolerado automaticamente, sem exigir justificativa/ação.
-- AGORA: é tolerado se o consumo do dia ficar dentro de 135% do limite
-- diário da escola (limite × 1.35) — 35% de folga proporcional ao porte
-- da unidade. Escolas grandes ganham mais margem absoluta; escolas
-- pequenas, menos. Uma escola cujo limite diário é 2 m³ passa a tolerar
-- até 2.70 m³ (antes tolerava até 5 m³); uma cujo limite é 20 m³ tolera
-- até 27 m³ (antes 23 m³).
--
-- Os marcos de 4 dias (alerta de conscientização) e 8 dias (perda da
-- tolerância pelo resto do mês) NÃO mudam.
--
-- Efeito de borda: dias com 0 pessoas informadas (limite diário = 0, ex.:
-- lançamentos de recesso feitos por admin/dirigente) deixam de ter
-- qualquer folga — 1.35 × 0 = 0. Antes tinham 3 m³. São casos raros e não
-- deveriam entrar na tolerância esporádica de qualquer forma.
--
-- ATENÇÃO: o fator 1.35 abaixo precisa ficar em sincronia com a constante
-- FATOR_TOLERANCIA_ESPORADICA em src/pages/ConsumoAgua.tsx — o trigger é
-- quem decide de fato, o frontend só usa o mesmo fator pra mostrar a
-- prévia coerente antes de salvar. O 0.009 (litros/pessoa/dia em m³)
-- também espelha LIMITE_DIARIO_POR_PESSOA lá.

comment on column public.consumo_agua.is_sporadic_excess is
  'Excesso diário dentro da margem de tolerância (até 35% acima do limite diário da escola), tolerado automaticamente sem exigir justificativa/ação. Definido pelo trigger trg_water_tolerance, não pelo cliente.';

-- Recria com os textos de alerta em "35%" (mantém o bloco EXCEPTION
-- introduzido em 20260824020000_fix_water_tolerance_alert.sql).
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
    v_msg := 'Sua escola atingiu 4 dias de excesso esporádico no consumo de água este mês (até 35% acima do limite diário, tolerado automaticamente, sem necessidade de justificativa). Fique atenta ao consumo para evitar desperdício de água.';
  else
    v_msg := 'Atenção: sua escola atingiu 8 dias de excesso esporádico no consumo de água este mês. A tolerância automática se esgotou — a partir de agora, qualquer novo excesso de consumo (mesmo dentro da margem de 35%) exigirá justificativa e plano de ação.';
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

  -- Fora da margem de 35% (consumo > limite × 1.35): excesso "severo",
  -- comportamento inalterado (exige justificativa/ação, já validado no
  -- frontend antes de chegar aqui).
  if NEW.consumption_diff > daily_limit * 1.35 then
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
