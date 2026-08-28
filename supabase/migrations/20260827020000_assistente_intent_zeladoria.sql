-- Assistente de IA — intent de dados para "zeladoria" (retrieval, SEM tokens).
-- Traz a situação real da zeladoria da PRÓPRIA escola (school_id via
-- get_my_school_id()). Continua passando pela fila de validação.

create or replace function public.assistente_intent_zeladoria()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_z record;
  v_status text;
  v_perto boolean;
begin
  if v_school is null then
    return null;
  end if;

  select id, zelador, ocupada, validade, perto_de_vencer, sei_numero
  into v_z
  from public.zeladorias
  where school_id = v_school
  order by validade desc nulls last
  limit 1;

  if not found then
    return 'Não há registro de zeladoria para a sua escola no sistema. Para regularizar, procure a SEFISC.';
  end if;

  select new_status
  into v_status
  from public.zeladoria_timeline
  where zeladoria_id = v_z.id
  order by changed_at desc
  limit 1;

  v_perto := lower(coalesce(v_z.perto_de_vencer, '')) in ('sim', 's', 'true', 'x', '1');

  return format(
    'Zeladoria da sua escola:%s%s%s%s%s',
    case when coalesce(btrim(v_z.zelador), '') = ''
         then ' sem zelador cadastrado.'
         else ' zelador(a) ' || v_z.zelador || '.' end,
    case when coalesce(btrim(v_z.ocupada), '') <> ''
         then ' Imóvel: ' || v_z.ocupada || '.'
         else '' end,
    case when v_status is not null
         then ' Etapa atual do processo: ' || replace(v_status, '_', ' ') || '.'
         else '' end,
    case when v_z.validade is not null
         then ' Autorização válida até ' || to_char(v_z.validade, 'DD/MM/YYYY') || '.'
         else ' Sem data de validade registrada.' end,
    case when v_perto
         then ' ATENÇÃO: a autorização está perto de vencer — providencie a renovação junto à SEFISC.'
         else '' end
  );
end;
$$;

grant execute on function public.assistente_intent_zeladoria() to authenticated;


-- Dispatcher: adiciona o reconhecimento de "zeladoria" / "zelador".
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

  if t ~ 'zeladori' or t ~ '\mzelador' then
    return public.assistente_intent_zeladoria();
  end if;

  return null;
end;
$$;


-- FAQ de partida sobre o processo de zeladoria (fallback se a intent não casar).
insert into public.assistente_faq (pergunta_titulo, corpo_resposta, palavras_chave, escopo) values
  ('Processo / autorização de zeladoria',
   'O processo de zeladoria (autorização de uso do imóvel funcional pelo zelador) é acompanhado pela SEFISC. Consulte a etapa atual e a validade da autorização na tela Zeladoria do sistema. Para renovação, atualização de dados do zelador ou dúvidas sobre o SEI, procure a SEFISC.',
   array['zeladoria','zelador','imovel funcional','autorizacao de uso','sefisc','renovacao zeladoria'],
   'procedimento')
on conflict do nothing;
