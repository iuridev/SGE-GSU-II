-- Regularização de Imóveis (src/pages/RegularizacaoImoveis.tsx): a planilha que o
-- servidor alimenta não tem data por movimentação, então a evolução mês a mês é
-- reconstruída a partir de uma "fotografia" diária do status de cada unidade,
-- gravada (upsert pela data) sempre que alguém abre a página. O relatório mensal
-- compara a última fotografia do mês escolhido com a última do mês anterior.

create table if not exists public.regularizacao_imoveis_snapshots (
  data date primary key,
  -- Totais do dia (ResumoRegularizacao em src/lib/regularizacaoImoveis.ts).
  resumo jsonb not null,
  -- { "<nome normalizado da escola>": { "escola": "...", "status": "..." } }
  por_escola jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.regularizacao_imoveis_snapshots is 'Fotografia diária do status de regularização dos imóveis escolares, lida da planilha do servidor responsável — base do gráfico de evolução e do relatório mensal.';

alter table public.regularizacao_imoveis_snapshots enable row level security;

create policy "regularizacao_imoveis_snapshots: leitura" on public.regularizacao_imoveis_snapshots
  for select to authenticated using (true);
create policy "regularizacao_imoveis_snapshots: escrita" on public.regularizacao_imoveis_snapshots
  for all to authenticated using (true) with check (true);

create trigger trg_block_write_readonly before insert or delete or update
  on public.regularizacao_imoveis_snapshots for each row
  execute function public.block_write_for_readonly_roles();
