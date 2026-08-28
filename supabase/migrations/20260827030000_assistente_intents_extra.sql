-- Assistente de IA — mais intents de dados (retrieval, SEM tokens):
-- pendências semanais (água + manejo arbóreo), obras e patrimônio.
-- Toda consulta é escopada por get_my_school_id(). Continua passando pela
-- fila de validação do regional_admin.

-- ─── Intent: pendências semanais ───────────────────────────────────────────
create or replace function public.assistente_intent_pendencias()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_agua int;
  v_manejo record;
  v_partes text[] := '{}';
begin
  if v_school is null then
    return null;
  end if;

  select coalesce(sum(missing_days), 0)
  into v_agua
  from public.get_pending_water_schools(current_date - 10, current_date)
  where school_id = v_school;

  if coalesce(v_agua, 0) > 0 then
    v_partes := array_append(v_partes,
      format('Consumo de água: %s dia(s) útil(eis) sem registro nos últimos 10 dias.', v_agua));
  else
    v_partes := array_append(v_partes, 'Consumo de água: em dia.');
  end if;

  select validade_autorizacao, nao_se_aplica
  into v_manejo
  from public.manejo_arboreo
  where escola_id = v_school
  order by created_at desc
  limit 1;

  if not found then
    v_partes := array_append(v_partes, 'Manejo arbóreo: sem registro — preencha na tela Pendências Semanais.');
  elsif v_manejo.nao_se_aplica then
    v_partes := array_append(v_partes, 'Manejo arbóreo: marcado como "não se aplica".');
  elsif v_manejo.validade_autorizacao is null then
    v_partes := array_append(v_partes, 'Manejo arbóreo: sem data de validade da autorização registrada.');
  elsif v_manejo.validade_autorizacao < current_date then
    v_partes := array_append(v_partes,
      format('Manejo arbóreo: autorização VENCIDA em %s.', to_char(v_manejo.validade_autorizacao, 'DD/MM/YYYY')));
  else
    v_partes := array_append(v_partes,
      format('Manejo arbóreo: autorização válida até %s.', to_char(v_manejo.validade_autorizacao, 'DD/MM/YYYY')));
  end if;

  return 'Pendências semanais da sua escola — ' || array_to_string(v_partes, ' ');
end;
$$;


-- ─── Intent: obras e reformas ─────────────────────────────────────────────
create or replace function public.assistente_intent_obras()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_count int;
  v_lista text;
begin
  if v_school is null then
    return null;
  end if;

  select count(*),
         string_agg(
           format('- %s (%s): %s, início %s, prazo %s dias',
                  title, company_name, replace(status, '_', ' '),
                  to_char(start_date, 'DD/MM/YYYY'), deadline_days),
           E'\n' order by start_date desc
         )
  into v_count, v_lista
  from public.construction_works
  where school_id = v_school
    and status not ilike '%conclu%';

  if coalesce(v_count, 0) = 0 then
    return 'Não há obras ou reformas em andamento cadastradas para a sua escola.';
  end if;

  return format('Obras/reformas em andamento na sua escola (%s):%s%s', v_count, E'\n', v_lista);
end;
$$;


-- ─── Intent: patrimônio ───────────────────────────────────────────────────
create or replace function public.assistente_intent_patrimonio()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_proc_count int;
  v_proc_lista text;
  v_ocor int;
begin
  if v_school is null then
    return null;
  end if;

  select count(*),
         string_agg(
           format('- %s (SEI %s): etapa %s [%s]',
                  type, sei_number, current_step, coalesce(status, 'ATIVO')),
           E'\n' order by process_date desc
         )
  into v_proc_count, v_proc_lista
  from public.asset_processes
  where school_id = v_school
    and coalesce(status, 'ATIVO') not ilike '%conclu%';

  select count(*)
  into v_ocor
  from public.patrimonial_occurrences
  where school_id = v_school
    and status = 'Pendente';

  if coalesce(v_proc_count, 0) = 0 and coalesce(v_ocor, 0) = 0 then
    return 'A sua escola não tem processos de patrimônio em aberto nem ocorrências patrimoniais pendentes.';
  end if;

  return format(
    '%s%s',
    case when coalesce(v_proc_count, 0) > 0
         then format('Processos de patrimônio em aberto (%s):%s%s', v_proc_count, E'\n', v_proc_lista)
         else 'Nenhum processo de patrimônio em aberto.' end,
    case when coalesce(v_ocor, 0) > 0
         then format('%sOcorrências patrimoniais pendentes: %s.', E'\n\n', v_ocor)
         else '' end
  );
end;
$$;


grant execute on function public.assistente_intent_pendencias()  to authenticated;
grant execute on function public.assistente_intent_obras()       to authenticated;
grant execute on function public.assistente_intent_patrimonio()  to authenticated;


-- ─── Dispatcher completo (6 intents) ──────────────────────────────────────
create or replace function public.assistente_detectar_intent(p_texto text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := public.assistente_expandir(p_texto); -- minúsculo, sem acento, sinônimos aplicados
begin
  -- pendências semanais primeiro (pode conter "agua"/"manejo" sem ser consulta de consumo)
  if t ~ 'pendencia' and (t ~ 'semanal' or t ~ 'semana' or t ~ 'agua' or t ~ 'manejo' or t ~ 'arvore|arboreo') then
    return public.assistente_intent_pendencias();
  end if;

  if t ~ '(consumo|gasto|leitura|hidrometro|fatura|conta).*agua'
     or t ~ 'agua.*(consumo|gasto|leitura|m3|mes|gastando|gastei)' then
    return public.assistente_intent_consumo_agua();
  end if;

  if t ~ '(meus|minhas|quais|tenho|ver|listar|status).*(chamado|ticket|protocolo)'
     or t ~ '(chamado|ticket).*(aberto|andamento|pendente|status|em aberto)' then
    return public.assistente_intent_chamados();
  end if;

  if t ~ 'zeladori' or t ~ '\mzelador' then
    return public.assistente_intent_zeladoria();
  end if;

  if t ~ '\mobra' or t ~ 'reforma' or t ~ 'construcao' then
    return public.assistente_intent_obras();
  end if;

  if t ~ 'patrimoni' or t ~ 'tombamento' or t ~ 'nota de lancamento' or t ~ 'bem (movel|publico)' then
    return public.assistente_intent_patrimonio();
  end if;

  return null;
end;
$$;


-- ─── FAQs de partida (fallback) ───────────────────────────────────────────
insert into public.assistente_faq (pergunta_titulo, corpo_resposta, palavras_chave, escopo) values
  ('Pendências semanais (água e manejo arbóreo)',
   'As pendências semanais são preenchidas na tela Pendências Semanais: o registro diário do consumo de água (dias úteis) e a situação do manejo arbóreo (validade da autorização ou "não se aplica"). Mantenha os dois em dia para não gerar pendência.',
   array['pendencia semanal','pendencias','manejo arboreo','registro de agua','autorizacao manejo'],
   'procedimento'),
  ('Acompanhamento de obras e reformas',
   'As obras e reformas da escola aparecem na tela Obras e Reformas, com empresa responsável, data de início, prazo e status. Para dúvidas sobre andamento ou aditivos, procure a SEOM.',
   array['obra','obras','reforma','construcao','seom','empresa','prazo obra'],
   'procedimento'),
  ('Processos e ocorrências de patrimônio',
   'Os processos de patrimônio (SEI) e as ocorrências patrimoniais da escola ficam nas telas de Patrimônio. Para abrir um novo processo ou registrar ocorrência, siga o fluxo da tela correspondente; dúvidas com a SEFISC.',
   array['patrimonio','patrimonial','processo sei','ocorrencia patrimonial','tombamento','nota de lancamento'],
   'procedimento')
on conflict do nothing;
