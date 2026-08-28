-- Fase 4 do assistente de IA (retrieval, SEM tokens): "intents" de dados.
--
-- Além da FAQ curada, o assistente reconhece algumas perguntas sobre os
-- dados da PRÓPRIA escola e já monta o rascunho com o número real. Toda
-- consulta usa get_my_school_id() (nunca parâmetro do cliente), então uma
-- escola nunca enxerga dados de outra. O rascunho continua indo para a fila
-- de validação do regional_admin — nada é entregue automaticamente.

-- Marca a origem do rascunho para a tela de validação distinguir
-- "sugestão da base" de "dado ao vivo da escola".
alter table public.assistente_perguntas
  add column if not exists rascunho_origem text
  check (rascunho_origem in ('faq', 'intent'));


-- ─── Intent: consumo de água ────────────────────────────────────────────────
create or replace function public.assistente_intent_consumo_agua()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_ultima record;
  v_mes numeric;
begin
  if v_school is null then
    return null;
  end if;

  select "date", reading_m3, consumption_diff, limit_exceeded
  into v_ultima
  from public.consumo_agua
  where school_id = v_school
  order by "date" desc
  limit 1;

  if not found then
    return 'Ainda não há leituras de consumo de água registradas para a sua escola.';
  end if;

  select coalesce(sum(consumption_diff), 0)
  into v_mes
  from public.consumo_agua
  where school_id = v_school
    and "date" >= date_trunc('month', current_date);

  return format(
    'Consumo de água da sua escola: última leitura em %s foi de %s m³ (variação de %s m³).%s No mês atual, o consumo acumulado registrado é de %s m³.',
    to_char(v_ultima."date", 'DD/MM/YYYY'),
    trim(to_char(v_ultima.reading_m3, 'FM999999990.00')),
    trim(to_char(coalesce(v_ultima.consumption_diff, 0), 'FM999999990.00')),
    case when v_ultima.limit_exceeded
         then ' Atenção: a última leitura ultrapassou o limite esperado.'
         else '' end,
    trim(to_char(v_mes, 'FM999999990.00'))
  );
end;
$$;


-- ─── Intent: chamados em aberto ─────────────────────────────────────────────
create or replace function public.assistente_intent_chamados()
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
           format('- %s: %s [%s]', protocol, title, replace(status, '_', ' ')),
           E'\n' order by created_at desc
         )
  into v_count, v_lista
  from public.internal_tickets
  where school_id = v_school
    and status <> 'CONCLUIDO';

  if coalesce(v_count, 0) = 0 then
    return 'A sua escola não tem chamados em aberto no momento.';
  end if;

  return format('A sua escola tem %s chamado(s) em aberto:%s%s', v_count, E'\n', v_lista);
end;
$$;


-- ─── Dispatcher: detecta a intent e devolve a resposta (ou null) ────────────
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
  if t ~ '(consumo|gasto|leitura|hidrometro|fatura|conta).*agua'
     or t ~ 'agua.*(consumo|gasto|leitura|m3|mes|gastando|gastei)' then
    return public.assistente_intent_consumo_agua();
  end if;

  if t ~ '(meus|minhas|quais|tenho|ver|listar|status).*(chamado|ticket|protocolo)'
     or t ~ '(chamado|ticket).*(aberto|andamento|pendente|status|em aberto)' then
    return public.assistente_intent_chamados();
  end if;

  return null;
end;
$$;


-- ─── assistente_perguntar: agora tenta intent antes da FAQ ──────────────────
create or replace function public.assistente_perguntar(p_conversa_id uuid, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_school uuid;
  v_conv record;
  v_msg_id uuid;
  v_pergunta_id uuid;
  v_intent text;
  v_faq record;
  v_rascunho text;
  v_score real;
  v_origem text;
  v_faq_id uuid;
begin
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'Pergunta vazia.';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'school_manager' then
    raise exception 'Somente usuários de escola podem usar o assistente.'
      using errcode = '42501';
  end if;

  select * into v_conv from public.assistente_conversas
  where id = p_conversa_id and user_id = auth.uid() and status = 'aberta';
  if not found then
    raise exception 'Conversa inválida.' using errcode = '42501';
  end if;

  v_school := public.get_my_school_id();

  insert into public.assistente_mensagens (conversa_id, autor, conteudo)
  values (p_conversa_id, 'usuario', btrim(p_texto))
  returning id into v_msg_id;

  -- 1) intent de dados (mais valioso: número real da escola)
  v_intent := public.assistente_detectar_intent(btrim(p_texto));

  if v_intent is not null then
    v_rascunho := v_intent;
    v_score := 1.0;
    v_origem := 'intent';
    v_faq_id := null;
  else
    -- 2) fallback: melhor resposta da base curada
    select * into v_faq from public.assistente_buscar_faq(btrim(p_texto));
    if v_faq.score >= 0.15 then
      v_rascunho := v_faq.resposta;
      v_score := v_faq.score;
      v_origem := 'faq';
      v_faq_id := v_faq.faq_id;
    else
      v_rascunho := null;
      v_score := v_faq.score;
      v_origem := null;
      v_faq_id := null;
    end if;
  end if;

  insert into public.assistente_perguntas
    (conversa_id, mensagem_id, user_id, school_id, texto,
     rascunho_resposta, rascunho_score, rascunho_origem, faq_id)
  values
    (p_conversa_id, v_msg_id, auth.uid(), v_school, btrim(p_texto),
     v_rascunho, v_score, v_origem, v_faq_id)
  returning id into v_pergunta_id;

  update public.assistente_conversas
  set atualizado_em = now() where id = p_conversa_id;

  return v_pergunta_id;
end;
$$;


grant execute on function public.assistente_intent_consumo_agua()   to authenticated;
grant execute on function public.assistente_intent_chamados()       to authenticated;
grant execute on function public.assistente_detectar_intent(text)   to authenticated;


-- ─── assistente_validar: registra a origem real (faq/intent/humano) ─────────
create or replace function public.assistente_validar(
  p_pergunta_id uuid,
  p_resposta_final text,
  p_aprovar boolean default true,
  p_salvar_faq boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_perg record;
  v_origem text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'regional_admin' then
    raise exception 'Somente o regional_admin pode validar respostas.'
      using errcode = '42501';
  end if;

  select * into v_perg from public.assistente_perguntas where id = p_pergunta_id;
  if not found then
    raise exception 'Pergunta não encontrada.';
  end if;
  if v_perg.status <> 'pendente_validacao' then
    raise exception 'Esta pergunta já foi tratada.';
  end if;

  if p_aprovar then
    if coalesce(btrim(p_resposta_final), '') = '' then
      raise exception 'Resposta final vazia.';
    end if;

    if btrim(p_resposta_final) is not distinct from btrim(coalesce(v_perg.rascunho_resposta, '')) then
      v_origem := coalesce(v_perg.rascunho_origem, 'faq');
    else
      v_origem := 'humano';
    end if;

    insert into public.assistente_mensagens
      (conversa_id, autor, conteudo, origem, pergunta_id)
    values
      (v_perg.conversa_id, 'assistente', btrim(p_resposta_final), v_origem, v_perg.id);

    update public.assistente_perguntas
    set status = 'aprovada',
        resposta_final = btrim(p_resposta_final),
        validado_por = auth.uid(),
        validado_em = now()
    where id = p_pergunta_id;

    if p_salvar_faq then
      insert into public.assistente_faq (pergunta_titulo, corpo_resposta, criado_por)
      values (left(v_perg.texto, 200), btrim(p_resposta_final), auth.uid());
    end if;
  else
    update public.assistente_perguntas
    set status = 'rejeitada',
        resposta_final = nullif(btrim(coalesce(p_resposta_final, '')), ''),
        validado_por = auth.uid(),
        validado_em = now()
    where id = p_pergunta_id;

    if coalesce(btrim(p_resposta_final), '') <> '' then
      insert into public.assistente_mensagens
        (conversa_id, autor, conteudo, origem, pergunta_id)
      values (v_perg.conversa_id, 'admin', btrim(p_resposta_final), 'humano', v_perg.id);
    end if;
  end if;

  update public.assistente_conversas
  set atualizado_em = now() where id = v_perg.conversa_id;
end;
$$;

grant execute on function public.assistente_validar(uuid, text, boolean, boolean) to authenticated;
