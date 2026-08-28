-- Assistente de IA (retrieval puro, SEM tokens / SEM LLM).
--
-- Ideia: um botão flutuante abre um mini-chat onde o school_manager faz
-- perguntas. O "entendimento" é 100% Postgres (full-text pt-BR + pg_trgm
-- + sinônimos), sem nenhuma chamada a modelo de linguagem. O sistema
-- monta um RASCUNHO de resposta a partir de uma base curada (assistente_faq).
--
-- Nada chega ao usuário sem passar pela fila de validação do regional_admin:
--   pergunta -> status 'pendente_validacao' (com ou sem rascunho)
--   regional_admin edita/aprova/rejeita
--   ao aprovar, a resposta vira uma mensagem 'assistente' na conversa e o
--   front entrega em tempo real (Realtime em assistente_mensagens).
--
-- Isolamento entre escolas: o school_id vem SEMPRE de get_my_school_id()
-- (nunca do cliente); RLS restringe cada escola às próprias conversas.
-- chefe_departamento continua somente-leitura (trigger global de bloqueio
-- de escrita, ver 20260713010000_add_read_only_role_write_block.sql).

-- ─── Extensões ───────────────────────────────────────────────────────────────
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent() é STABLE (depende de dicionário), então não pode ir direto em
-- índice / coluna gerada. Wrapper fixando o dicionário (schema-qualificado,
-- SEM cláusula SET — igual ao exemplo da doc do Postgres) para podermos
-- indexar por trigram.
create or replace function public.imm_unaccent(txt text)
returns text
language sql
immutable
parallel safe
as $$ select public.unaccent('public.unaccent'::regdictionary, coalesce(txt, '')) $$;


-- ─── Base de conhecimento curada ─────────────────────────────────────────────
create table if not exists public.assistente_faq (
  id uuid primary key default gen_random_uuid(),
  pergunta_titulo text not null,
  corpo_resposta  text not null,
  palavras_chave  text[] not null default '{}',
  -- 'procedimento' = dúvida de processo (ex.: como pedir merenda)
  -- 'dados'        = pergunta que idealmente vira consulta (fase 4); por ora
  --                  também respondida por texto curado
  escopo text not null default 'procedimento'
    check (escopo in ('procedimento', 'dados', 'geral')),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Mantida por trigger (mais robusto que coluna gerada, que rejeita
  -- to_tsvector + unaccent como "não imutável" em algumas versões).
  tsv tsvector
);

-- Popula/atualiza tsv a cada insert/update.
create or replace function public.assistente_faq_tsv_trigger()
returns trigger
language plpgsql
as $$
begin
  new.tsv := to_tsvector(
    'portuguese',
    public.imm_unaccent(
      coalesce(new.pergunta_titulo, '') || ' ' ||
      coalesce(new.corpo_resposta, '')  || ' ' ||
      coalesce(array_to_string(new.palavras_chave, ' '), '')
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_assistente_faq_tsv on public.assistente_faq;
create trigger trg_assistente_faq_tsv
  before insert or update of pergunta_titulo, corpo_resposta, palavras_chave
  on public.assistente_faq
  for each row execute function public.assistente_faq_tsv_trigger();

create index if not exists assistente_faq_tsv_idx
  on public.assistente_faq using gin (tsv);
create index if not exists assistente_faq_titulo_trgm_idx
  on public.assistente_faq using gin (public.imm_unaccent(pergunta_titulo) gin_trgm_ops);
create index if not exists assistente_faq_ativo_idx
  on public.assistente_faq (ativo) where ativo;


-- ─── Sinônimos (expansão de termos antes do match) ───────────────────────────
-- Ex.: ('luz', 'energia'), ('merenda', 'alimentacao escolar'),
--      ('conta de agua', 'fatura sabesp'). termo e canonico já sem acento.
create table if not exists public.assistente_sinonimos (
  id uuid primary key default gen_random_uuid(),
  termo text not null unique,
  canonico text not null,
  criado_em timestamptz not null default now()
);


-- ─── Conversa (a "mini janela" de cada usuário) ──────────────────────────────
create table if not exists public.assistente_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta', 'concluida')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists assistente_conversas_user_idx
  on public.assistente_conversas (user_id, status);
create index if not exists assistente_conversas_school_idx
  on public.assistente_conversas (school_id);


-- ─── Mensagens do mini-chat ─────────────────────────────────────────────────
-- A resposta do assistente SÓ entra aqui depois de aprovada na fila.
create table if not exists public.assistente_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.assistente_conversas(id) on delete cascade,
  autor text not null check (autor in ('usuario', 'assistente', 'admin', 'sistema')),
  conteudo text not null,
  -- de onde saiu a resposta do assistente/admin: 'faq' (rascunho aceito),
  -- 'humano' (admin escreveu), 'sistema' (aviso automático)
  origem text check (origem in ('faq', 'intent', 'humano', 'sistema')),
  pergunta_id uuid,
  criado_em timestamptz not null default now()
);

create index if not exists assistente_mensagens_conversa_idx
  on public.assistente_mensagens (conversa_id, criado_em);


-- ─── Fila de validação ──────────────────────────────────────────────────────
create table if not exists public.assistente_perguntas (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.assistente_conversas(id) on delete cascade,
  mensagem_id uuid references public.assistente_mensagens(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  texto text not null,
  status text not null default 'pendente_validacao'
    check (status in ('pendente_validacao', 'aprovada', 'rejeitada')),
  -- rascunho gerado pelo retrieval (pode ser nulo = "não sei responder")
  rascunho_resposta text,
  rascunho_score real,
  faq_id uuid references public.assistente_faq(id) on delete set null,
  -- o que o regional_admin efetivamente enviou
  resposta_final text,
  validado_por uuid references auth.users(id) on delete set null,
  validado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists assistente_perguntas_status_idx
  on public.assistente_perguntas (status, criado_em);
create index if not exists assistente_perguntas_user_idx
  on public.assistente_perguntas (user_id, criado_em);


-- ─── View segura para o school_manager ──────────────────────────────────────
-- A tabela assistente_perguntas expõe o rascunho não-validado, então o
-- SELECT direto dela é só para admin (ver RLS abaixo). O usuário comum
-- enxerga o andamento das próprias perguntas por esta view, que NUNCA
-- mostra rascunho_resposta/score.
create or replace view public.assistente_minhas_perguntas
with (security_barrier = true) as
  select id, conversa_id, texto, status, resposta_final, criado_em, validado_em
  from public.assistente_perguntas
  where user_id = auth.uid();


-- ─── Retrieval: expansão de sinônimos ───────────────────────────────────────
create or replace function public.assistente_expandir(p_texto text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := public.imm_unaccent(lower(coalesce(p_texto, '')));
  s record;
begin
  for s in select termo, canonico from public.assistente_sinonimos loop
    t := regexp_replace(t, '\m' || regexp_replace(s.termo, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M',
                        public.imm_unaccent(lower(s.canonico)), 'gi');
  end loop;
  return t;
end;
$$;


-- ─── Retrieval: melhor resposta da FAQ ──────────────────────────────────────
-- Retorna no máximo 1 linha. score combina ranking de full-text com
-- similaridade trigram do título. O limiar de aceitação fica no chamador.
create or replace function public.assistente_buscar_faq(p_texto text)
returns table (faq_id uuid, resposta text, score real)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select public.assistente_expandir(p_texto) as texto
  )
  select
    f.id,
    f.corpo_resposta,
    (
      ts_rank(f.tsv, websearch_to_tsquery('portuguese', (select texto from q))) * 4.0
      + similarity(public.imm_unaccent(f.pergunta_titulo), (select texto from q))
      + case when exists (
          select 1 from unnest(f.palavras_chave) k
          where (select texto from q) like '%' || public.imm_unaccent(lower(k)) || '%'
        ) then 0.5 else 0 end
    )::real as score
  from public.assistente_faq f, q
  where f.ativo
    and (
      f.tsv @@ websearch_to_tsquery('portuguese', q.texto)
      or public.imm_unaccent(f.pergunta_titulo) % q.texto
      or exists (
        select 1 from unnest(f.palavras_chave) k
        where q.texto like '%' || public.imm_unaccent(lower(k)) || '%'
      )
    )
  order by score desc
  limit 1;
$$;


-- ─── RPC: abrir (ou reaproveitar) a conversa do usuário ─────────────────────
create or replace function public.assistente_iniciar_conversa()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_school uuid;
  v_id uuid;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'school_manager' then
    raise exception 'Somente usuários de escola podem usar o assistente.'
      using errcode = '42501';
  end if;

  v_school := public.get_my_school_id();

  select id into v_id
  from public.assistente_conversas
  where user_id = auth.uid() and status = 'aberta'
  order by criado_em desc
  limit 1;

  if v_id is null then
    insert into public.assistente_conversas (user_id, school_id)
    values (auth.uid(), v_school)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


-- ─── RPC: enviar pergunta ───────────────────────────────────────────────────
-- Grava a mensagem do usuário, roda o retrieval, cria o item na fila de
-- validação. NÃO devolve resposta nenhuma — ela só existe depois de aprovada.
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
  v_faq record;
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

  select * into v_faq from public.assistente_buscar_faq(btrim(p_texto));

  insert into public.assistente_perguntas
    (conversa_id, mensagem_id, user_id, school_id, texto,
     rascunho_resposta, rascunho_score, faq_id)
  values
    (p_conversa_id, v_msg_id, auth.uid(), v_school, btrim(p_texto),
     case when v_faq.score >= 0.15 then v_faq.resposta else null end,
     v_faq.score,
     case when v_faq.score >= 0.15 then v_faq.faq_id else null end)
  returning id into v_pergunta_id;

  update public.assistente_conversas
  set atualizado_em = now() where id = p_conversa_id;

  return v_pergunta_id;
end;
$$;


-- ─── RPC: validar (regional_admin) ─────────────────────────────────────────
-- p_aprovar = true  -> resposta vira mensagem 'assistente' na conversa
-- p_aprovar = false -> pergunta marcada 'rejeitada' (opcionalmente com aviso)
-- p_salvar_faq = true -> a resposta final entra na base curada
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

    insert into public.assistente_mensagens
      (conversa_id, autor, conteudo, origem, pergunta_id)
    values
      (v_perg.conversa_id, 'assistente', btrim(p_resposta_final),
       case when btrim(p_resposta_final) is not distinct from btrim(coalesce(v_perg.rascunho_resposta, ''))
            then 'faq' else 'humano' end,
       v_perg.id);

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


-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.assistente_faq        enable row level security;
alter table public.assistente_sinonimos  enable row level security;
alter table public.assistente_conversas  enable row level security;
alter table public.assistente_mensagens  enable row level security;
alter table public.assistente_perguntas  enable row level security;

-- FAQ: qualquer autenticado lê itens ativos; admin gerencia.
drop policy if exists "assistente_faq_select" on public.assistente_faq;
create policy "assistente_faq_select" on public.assistente_faq
  for select to authenticated
  using (
    ativo
    or exists (select 1 from public.profiles p
               where p.id = auth.uid()
                 and p.role in ('regional_admin', 'chefe_departamento'))
  );

drop policy if exists "assistente_faq_write_admin" on public.assistente_faq;
create policy "assistente_faq_write_admin" on public.assistente_faq
  for all to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'regional_admin'))
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and p.role = 'regional_admin'));

-- Sinônimos: leitura geral, escrita admin.
drop policy if exists "assistente_sinonimos_select" on public.assistente_sinonimos;
create policy "assistente_sinonimos_select" on public.assistente_sinonimos
  for select to authenticated using (true);

drop policy if exists "assistente_sinonimos_write_admin" on public.assistente_sinonimos;
create policy "assistente_sinonimos_write_admin" on public.assistente_sinonimos
  for all to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'regional_admin'))
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and p.role = 'regional_admin'));

-- Conversas: cada escola só a(s) própria(s); admin vê todas (para dar contexto
-- na tela de validação). Escrita só via RPC (security definer) — sem policy.
drop policy if exists "assistente_conversas_select" on public.assistente_conversas;
create policy "assistente_conversas_select" on public.assistente_conversas
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid()
                 and p.role in ('regional_admin', 'chefe_departamento'))
  );

-- Mensagens: visíveis para o dono da conversa e para admin. Sem escrita
-- direta — tudo passa pelas RPCs.
drop policy if exists "assistente_mensagens_select" on public.assistente_mensagens;
create policy "assistente_mensagens_select" on public.assistente_mensagens
  for select to authenticated
  using (
    exists (select 1 from public.assistente_conversas c
            where c.id = assistente_mensagens.conversa_id
              and (c.user_id = auth.uid()
                   or exists (select 1 from public.profiles p
                              where p.id = auth.uid()
                                and p.role in ('regional_admin', 'chefe_departamento')))
    )
  );

-- Fila: SELECT direto só para admin (contém rascunho não-validado).
-- O school_manager acompanha pela view assistente_minhas_perguntas.
drop policy if exists "assistente_perguntas_select_admin" on public.assistente_perguntas;
create policy "assistente_perguntas_select_admin" on public.assistente_perguntas
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid()
                   and p.role in ('regional_admin', 'chefe_departamento')));

grant select on public.assistente_minhas_perguntas to authenticated;

-- Mesma proteção de escrita das demais tabelas: chefe_departamento nunca
-- escreve (ver 20260713010000_add_read_only_role_write_block.sql). As RPCs
-- rodam como definer mas a trigger checa auth.uid(), então o bloqueio vale.
do $$
declare t text;
begin
  foreach t in array array[
    'assistente_faq', 'assistente_sinonimos', 'assistente_conversas',
    'assistente_mensagens', 'assistente_perguntas'
  ] loop
    execute format('drop trigger if exists trg_block_write_readonly on public.%I', t);
    execute format(
      'create trigger trg_block_write_readonly before insert or update or delete on public.%I for each row execute function public.block_write_for_readonly_roles()',
      t);
  end loop;
end $$;

-- Realtime para a entrega em tempo real da resposta aprovada.
do $$
begin
  alter publication supabase_realtime add table public.assistente_mensagens;
exception
  when duplicate_object then null;
end $$;

grant execute on function public.assistente_iniciar_conversa()          to authenticated;
grant execute on function public.assistente_perguntar(uuid, text)        to authenticated;
grant execute on function public.assistente_buscar_faq(text)             to authenticated;
grant execute on function public.assistente_expandir(text)               to authenticated;
grant execute on function public.assistente_validar(uuid, text, boolean, boolean) to authenticated;


-- ─── Seed inicial (migrado do MANUAL_DO_SISTEMA em src/lib/manualIA.ts) ─────
insert into public.assistente_faq (pergunta_titulo, corpo_resposta, palavras_chave, escopo) values
  ('Problema de infraestrutura (telhado, muro, vazamento)',
   'Para problemas de infraestrutura como telhado, muro ou vazamentos, preencha o Formulário FDE-Manutenção no portal.',
   array['telhado','muro','vazamento','infiltracao','estrutura','fde','manutencao','reforma','obra predial'],
   'procedimento'),
  ('Falta de água na escola',
   'Em caso de falta de água, abra um chamado na Sabesp pelo 0800-055-0195 e envie o número do protocolo para a regional.',
   array['falta de agua','sem agua','agua','sabesp','abastecimento','caminhao pipa'],
   'procedimento'),
  ('Dúvida ou erro no uso do sistema SGE-GSU-II',
   'Para dúvidas ou erros no uso do sistema, envie um print da tela mostrando o erro para a regional analisar.',
   array['erro','bug','sistema','tela','login','nao carrega','travou','print'],
   'procedimento'),
  ('Solicitação de merenda / mapa de merenda',
   'A escola deve preencher o mapa de merenda até o dia 5 de cada mês.',
   array['merenda','alimentacao escolar','mapa de merenda','comida','refeicao','pnae'],
   'procedimento')
on conflict do nothing;

insert into public.assistente_sinonimos (termo, canonico) values
  ('luz', 'energia'),
  ('sem luz', 'falta de energia'),
  ('conta de agua', 'fatura sabesp'),
  ('merenda', 'alimentacao escolar'),
  ('pipa', 'caminhao pipa'),
  ('chamado', 'ticket'),
  ('quadra', 'infraestrutura')
on conflict (termo) do nothing;
