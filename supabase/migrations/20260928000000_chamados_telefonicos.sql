-- Chamados abertos por telefone diretamente com o órgão responsável (SEOM/SEFISC/
-- outros), sem passar pelo Helpdesk do sistema — a escola só recebe um número de
-- protocolo por telefone e precisa repassar essa informação para a URE
-- acompanhar. A URE também pode cadastrar protocolos e atualizar o andamento.

create table if not exists public.chamados_telefonicos (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references public.schools(id),
  escola_nome text not null default '',
  protocolo text not null,
  descricao text not null,
  data_ocorrencia date not null,
  -- Sinalização da própria escola no momento do cadastro: o problema já foi
  -- resolvido por quem atendeu a ligação, ou ainda está em aberto?
  atendido text not null default 'NAO' check (atendido in ('SIM', 'NAO')),
  -- Status controlado pela URE ao longo do acompanhamento (independente do
  -- "atendido" da escola, que é só a percepção dela no momento da ligação).
  status text not null default 'ABERTO' check (status in ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO')),
  -- Quem registrou originalmente: a própria escola (via telefonema) ou a URE
  -- (cadastrando em nome da escola, ex.: quando ela liga direto para a URE).
  origem_cadastro text not null default 'escola' check (origem_cadastro in ('escola', 'ure')),
  autor_id uuid references auth.users(id),
  autor_nome text not null default '',
  data_registro timestamptz not null default timezone('utc', now()),
  -- Preenchida só na transição de status para CONCLUIDO (nunca sobrescrita numa
  -- edição comum) — usada pelo Relatório Mensal para contar conclusões por mês,
  -- já que updated_at muda em qualquer edição do registro.
  data_conclusao timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.chamados_telefonicos is 'Chamados/ocorrências abertos por telefone direto com o órgão responsável, repassados pela escola (ou cadastrados pela URE) para acompanhamento.';

create index if not exists chamados_telefonicos_escola_id_idx on public.chamados_telefonicos(escola_id);

-- Linha do tempo de comentários periódicos de acompanhamento (ambos os lados
-- podem registrar, conforme decidido: escola e URE têm acesso de edição igual).
create table if not exists public.chamados_telefonicos_comentarios (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados_telefonicos(id) on delete cascade,
  comentario text not null,
  autor_id uuid references auth.users(id),
  autor_nome text not null default '',
  data_registro timestamptz not null default timezone('utc', now())
);

create index if not exists chamados_telefonicos_comentarios_chamado_id_idx on public.chamados_telefonicos_comentarios(chamado_id);

alter table public.chamados_telefonicos enable row level security;
alter table public.chamados_telefonicos_comentarios enable row level security;

create policy "chamados_telefonicos: leitura" on public.chamados_telefonicos
  for select to authenticated using (true);
create policy "chamados_telefonicos: escrita" on public.chamados_telefonicos
  for all to authenticated using (true) with check (true);

create policy "chamados_telefonicos_comentarios: leitura" on public.chamados_telefonicos_comentarios
  for select to authenticated using (true);
create policy "chamados_telefonicos_comentarios: escrita" on public.chamados_telefonicos_comentarios
  for all to authenticated using (true) with check (true);

-- Mesmo padrão de bloqueio do papel somente-leitura (chefe_departamento) usado em
-- praticamente todas as outras tabelas do sistema.
create trigger trg_block_write_readonly before insert or delete or update
  on public.chamados_telefonicos for each row
  execute function public.block_write_for_readonly_roles();

create trigger trg_block_write_readonly before insert or delete or update
  on public.chamados_telefonicos_comentarios for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.chamados_telefonicos to anon;
grant all on table public.chamados_telefonicos to authenticated;
grant all on table public.chamados_telefonicos to service_role;

grant all on table public.chamados_telefonicos_comentarios to anon;
grant all on table public.chamados_telefonicos_comentarios to authenticated;
grant all on table public.chamados_telefonicos_comentarios to service_role;
