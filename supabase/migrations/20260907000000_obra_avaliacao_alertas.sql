-- Tabela de controle do alerta semanal de avaliações baixas do
-- Acompanhamento de Obras (nota < 4 no formulário que a escola preenche
-- toda semana). O snapshot em si (a resposta da escola) mora numa planilha
-- Google Forms pública, lida direto pela Edge Function
-- obras-alerta-semanal — esta tabela só guarda, por registro, se o e-mail
-- de alerta pra GSU (gsu.seom / gsu.sefisc) já foi disparado, pra:
--   1) a função de cron não mandar o mesmo alerta duas vezes;
--   2) a tela Acompanhamento Semanal de Obras mostrar "E-mail Enviado" /
--      "E-mail Não Enviado" ao lado de cada avaliação abaixo de 4.
--
-- O id é o MESMO identificador já usado no front (AcompanhamentoObras.tsx):
-- `${carimbo}-${escola}` — não precisa de join por outra chave.
create table if not exists public.obra_avaliacao_alertas (
  id text primary key,
  semana_inicio date not null,
  semana_fim date not null,
  escola text not null,
  nota integer not null,
  ocorrencia text,
  responsavel text,
  data_avaliacao date not null,
  email_enviado boolean not null default false,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table public.obra_avaliacao_alertas enable row level security;

-- Leitura liberada pra qualquer usuário logado — a tela já filtra por role
-- quem vê a página de Acompanhamento de Obras (regional_admin, supervisor,
-- dirigente, school_manager); aqui só expõe um boolean por registro, sem
-- dado sensível.
create policy "Leitura para autenticados"
  on public.obra_avaliacao_alertas
  for select
  to authenticated
  using (true);

-- Só a Edge Function (service role) grava — ninguém edita isso pela UI.
create policy "Escrita via service role"
  on public.obra_avaliacao_alertas
  for all
  to service_role
  using (true)
  with check (true);
