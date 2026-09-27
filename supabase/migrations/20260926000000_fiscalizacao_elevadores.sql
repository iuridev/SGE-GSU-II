-- Fiscalização quinzenal de elevadores.
-- O Fiscal Setorial (school_manager) responde um checklist rápido a cada
-- quinzena (dias 1–15 e 16–fim do mês) e o Fiscal Técnico da URE usa os
-- registros para montar relatórios. Uma linha por (escola, quinzena): reenviar
-- na mesma quinzena atualiza o registro (upsert).

create table if not exists public.elevator_inspections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  -- primeiro e último dia da quinzena avaliada
  period_start date not null,
  period_end date not null,
  inspector_id uuid references public.profiles(id),
  inspector_name text,

  is_operational boolean not null default true,
  down_since date,
  had_visit boolean not null default false,

  -- { itemId: 'ok' | 'nok' | 'na' } e { itemId: 'texto' } (só itens 'nok')
  answers jsonb not null default '{}'::jsonb,
  observations jsonb not null default '{}'::jsonb,

  had_call boolean not null default false,
  call_type text check (call_type in ('emergencial', 'corretivo')),
  call_opened_at timestamptz,
  call_attended_at timestamptz,
  call_response_minutes integer,
  person_trapped boolean not null default false,

  general_notes text,

  -- Derivados no cliente na hora do envio (guardados para consulta/relatório)
  score integer check (score between 0 and 100),
  status text not null default 'conforme' check (status in ('conforme', 'atencao', 'critico')),
  nonconformities text[] not null default '{}',

  unique (school_id, period_start)
);

create index if not exists elevator_inspections_period_idx
  on public.elevator_inspections(period_start desc);
create index if not exists elevator_inspections_school_idx
  on public.elevator_inspections(school_id, period_start desc);

alter table public.elevator_inspections enable row level security;

-- Mesmo espírito das demais tabelas operacionais: leitura para autenticados,
-- escrita para autenticados (o frontend trava o school_manager na própria
-- escola) e chefe_departamento barrado pelo trigger abaixo.
drop policy if exists "elevator_inspections_select" on public.elevator_inspections;
create policy "elevator_inspections_select" on public.elevator_inspections
  for select to authenticated using (true);

drop policy if exists "elevator_inspections_write" on public.elevator_inspections;
create policy "elevator_inspections_write" on public.elevator_inspections
  for all to authenticated using (true) with check (true);

drop trigger if exists trg_block_write_readonly on public.elevator_inspections;
create trigger trg_block_write_readonly before insert or update or delete
  on public.elevator_inspections
  for each row execute function public.block_write_for_readonly_roles();
