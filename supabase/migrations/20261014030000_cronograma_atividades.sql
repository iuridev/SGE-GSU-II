-- Cronograma de Atividades (SEOM / SEFISC): planejamento mensal do setor.
--
-- Cada linha é uma atividade PREVISTA (visita a escola, formação, oficina,
-- reunião, rotina administrativa ou live). Depois da data o regional_admin
-- informa se foi concluída ou não:
--   - VISITA concluída → a página registra a visita na planilha de "Visitas
--     às Escolas" (Edge Function google-sheets-visitas) e marca
--     `visita_registrada`;
--   - VISITA não realizada → vira sugestão para os meses seguintes até ser
--     reprogramada (nova linha com `origem_id` apontando para esta) ou
--     descartada (`sugestao_descartada`).

create table if not exists public.cronograma_atividades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,

  setor text not null check (setor in ('SEOM', 'SEFISC')),
  tipo text not null check (tipo in ('VISITA', 'FORMACAO', 'OFICINA', 'REUNIAO', 'ROTINA_ADM', 'LIVE')),
  titulo text not null,
  descricao text,
  responsavel text,
  local text,

  data_prevista date not null,
  hora_inicio time,
  hora_fim time,

  -- Só para tipo VISITA. Nome/código copiados para o registro na planilha
  -- de visitas, que não usa o id da escola.
  escola_id uuid references public.schools(id) on delete set null,
  escola_nome text,
  fde_code text,
  objetivo text,

  status text not null default 'PLANEJADA'
    check (status in ('PLANEJADA', 'CONCLUIDA', 'NAO_REALIZADA', 'CANCELADA')),
  data_realizada date,
  observacoes_conclusao text,
  motivo_nao_realizacao text,
  participantes integer check (participantes is null or participantes >= 0),

  visita_registrada boolean not null default false,
  visita_registro_id text,

  -- Reprogramação: a atividade nova aponta para a não realizada que a originou.
  origem_id uuid references public.cronograma_atividades(id) on delete set null,
  sugestao_descartada boolean not null default false,

  constraint cronograma_visita_tem_escola check (tipo <> 'VISITA' or escola_nome is not null)
);

create index if not exists cronograma_atividades_data_idx on public.cronograma_atividades (data_prevista);
create index if not exists cronograma_atividades_origem_idx on public.cronograma_atividades (origem_id);
create index if not exists cronograma_atividades_pendentes_idx on public.cronograma_atividades (tipo, status)
  where status = 'NAO_REALIZADA' and sugestao_descartada = false;

comment on table public.cronograma_atividades is 'Cronograma mensal de atividades da SEOM/SEFISC (previsto x realizado). Visitas concluídas são registradas na planilha de Visitas às Escolas.';

create or replace function public.cronograma_atividades_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_atividades_touch on public.cronograma_atividades;
create trigger trg_cronograma_atividades_touch
  before update on public.cronograma_atividades
  for each row execute function public.cronograma_atividades_touch();

-- RLS: planejamento interno do setor — só a administração regional lê e
-- escreve (o chefe_departamento lê; a trigger abaixo barra a escrita dele).
alter table public.cronograma_atividades enable row level security;

drop policy if exists "cronograma_atividades: leitura admin" on public.cronograma_atividades;
create policy "cronograma_atividades: leitura admin" on public.cronograma_atividades
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('regional_admin', 'manage_admin', 'admin', 'chefe_departamento')
  ));

drop policy if exists "cronograma_atividades: escrita admin" on public.cronograma_atividades;
create policy "cronograma_atividades: escrita admin" on public.cronograma_atividades
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ));

drop trigger if exists trg_block_write_readonly on public.cronograma_atividades;
create trigger trg_block_write_readonly before insert or delete or update
  on public.cronograma_atividades for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.cronograma_atividades to authenticated;
grant all on table public.cronograma_atividades to service_role;
