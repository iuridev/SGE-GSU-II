-- Selos de Excelência: reconhecimento das escolas que se destacam em cada
-- assunto do setor. O sistema sugere as escolas aptas a partir de uma
-- métrica (calculada no frontend, ver src/lib/selosMetricas.ts) e o
-- regional_admin decide a concessão. Cada concessão guarda o ano de
-- referência, para a escola montar a coleção de selos por ano.

-- Catálogo. Uma categoria nova é só uma linha nova aqui: com `metrica` nula
-- o selo é de atribuição manual; preenchida, aponta para um cálculo
-- registrado no frontend e `criterio_minimo` define o corte de aptidão.
create table if not exists public.selos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text not null unique,
  nome text not null,
  descricao text not null default '',
  -- chaves resolvidas em src/components/SeloBadge.tsx
  icone text not null default 'award',
  cor text not null default 'amber',
  metrica text,
  criterio_minimo numeric,
  ativo boolean not null default true,
  ordem integer not null default 0
);

comment on table public.selos is 'Catálogo dos Selos de Excelência (uma linha por categoria).';

-- Uma linha por selo concedido a uma escola em um ano. O valor da métrica é
-- gravado no momento da concessão para o histórico não mudar depois.
create table if not exists public.selos_escolas (
  id uuid primary key default gen_random_uuid(),
  selo_id uuid not null references public.selos(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  ano integer not null,
  valor_metrica numeric,
  detalhe_metrica text,
  observacao text,
  concedido_por uuid references public.profiles(id),
  concedido_por_nome text not null default '',
  concedido_em timestamptz not null default now(),
  unique (selo_id, school_id, ano)
);

comment on table public.selos_escolas is 'Selos de Excelência concedidos às escolas, por ano de referência.';

create index if not exists selos_escolas_school_idx on public.selos_escolas(school_id);
create index if not exists selos_escolas_ano_idx on public.selos_escolas(ano);

alter table public.selos enable row level security;
alter table public.selos_escolas enable row level security;

-- Leitura para toda a rede; escrita só para a administração regional. Aqui o
-- controle não pode ficar só no frontend (como em outras tabelas do sistema):
-- com escrita aberta, a própria escola conseguiria se conceder um selo.
drop policy if exists "selos: leitura" on public.selos;
create policy "selos: leitura" on public.selos
  for select to authenticated using (true);

drop policy if exists "selos: escrita admin" on public.selos;
create policy "selos: escrita admin" on public.selos
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ));

drop policy if exists "selos_escolas: leitura" on public.selos_escolas;
create policy "selos_escolas: leitura" on public.selos_escolas
  for select to authenticated using (true);

drop policy if exists "selos_escolas: escrita admin" on public.selos_escolas;
create policy "selos_escolas: escrita admin" on public.selos_escolas
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ));

-- Mesmo padrão de bloqueio do papel somente-leitura (chefe_departamento).
drop trigger if exists trg_block_write_readonly on public.selos;
create trigger trg_block_write_readonly before insert or delete or update
  on public.selos for each row
  execute function public.block_write_for_readonly_roles();

drop trigger if exists trg_block_write_readonly on public.selos_escolas;
create trigger trg_block_write_readonly before insert or delete or update
  on public.selos_escolas for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.selos to authenticated;
grant all on table public.selos to service_role;
grant all on table public.selos_escolas to authenticated;
grant all on table public.selos_escolas to service_role;

-- Categorias iniciais.
insert into public.selos (slug, nome, descricao, icone, cor, metrica, criterio_minimo, ordem)
values
  (
    'gestao-patrimonial',
    'Gestão Patrimonial',
    'Escola que abriu processo de Doação de Material Permanente para regularizar seus itens a incorporar.',
    'package', 'emerald', 'patrimonio_doacao_mat_permanente', 1, 10
  ),
  (
    'acompanhamento-obras',
    'Acompanhamento de Obras',
    'Escola que registra com frequência o acompanhamento semanal das obras em sua unidade.',
    'hardhat', 'orange', 'obras_acompanhamento', 8, 20
  )
on conflict (slug) do nothing;
