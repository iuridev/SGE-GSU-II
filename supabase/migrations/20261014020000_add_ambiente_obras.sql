-- Períodos de reforma/obra por ambiente.
-- Durante a obra, o ambiente não pode receber agendamentos.
-- Somente regional_admin cadastra/remove períodos.

create table if not exists public.ambiente_obras (
  id           uuid primary key default gen_random_uuid(),
  ambiente_id  uuid not null references public.ambientes(id) on delete cascade,
  data_inicio  date not null,
  data_fim     date not null,
  descricao    text,
  criado_por   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  constraint   data_fim_gte_inicio check (data_fim >= data_inicio)
);

create index if not exists ambiente_obras_ambiente_idx on public.ambiente_obras (ambiente_id);
create index if not exists ambiente_obras_periodo_idx  on public.ambiente_obras (data_inicio, data_fim);

comment on table public.ambiente_obras is
  'Períodos de reforma/obra por ambiente; bloqueia agendamentos no intervalo.';

alter table public.ambiente_obras enable row level security;

-- Qualquer usuário autenticado pode ler (precisa saber quais salas estão em obra)
drop policy if exists "ambiente_obras: leitura" on public.ambiente_obras;
create policy "ambiente_obras: leitura" on public.ambiente_obras
  for select to authenticated using (true);

-- Somente regional_admin pode inserir/atualizar/deletar
drop policy if exists "ambiente_obras: escrita" on public.ambiente_obras;
create policy "ambiente_obras: escrita" on public.ambiente_obras
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text = 'regional_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text = 'regional_admin'
    )
  );

grant all on table public.ambiente_obras to authenticated;
grant all on table public.ambiente_obras to service_role;
