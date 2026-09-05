-- Dispensa (isenção de registro de água) agora guarda histórico de períodos.
--
-- ANTES: schools.water_exempt era um booleano solto — a escola estava
-- dispensada ou não, sem registro de quando a dispensa começou nem quando
-- terminou.
-- AGORA: cada vez que a escola é dispensada, cria-se uma linha em
-- school_water_exemptions com start_date = hoje e end_date = null (período
-- em aberto). Ao remover a dispensa, grava-se end_date = hoje. O histórico
-- de todos os períodos fica preservado.
--
-- schools.water_exempt continua existindo como CACHE derivado (= "existe
-- período em aberto?") pra não quebrar os vários consumidores do booleano
-- (RankingEscolas, PendenciasSemanais, get_pending_water_schools, etc.).
-- Um trigger mantém esse cache em sincronia automaticamente.

create table if not exists public.school_water_exemptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  start_date date not null default current_date,
  end_date date,                       -- null = dispensa em aberto
  created_by uuid references public.profiles(id),
  ended_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint school_water_exemptions_dates_chk check (end_date is null or end_date >= start_date)
);

create index if not exists idx_school_water_exemptions_school_id
  on public.school_water_exemptions(school_id);

-- No máximo um período em aberto por escola.
create unique index if not exists uq_school_water_exemptions_open_period
  on public.school_water_exemptions(school_id) where end_date is null;

alter table public.school_water_exemptions enable row level security;

-- Leitura liberada pra qualquer autenticado (mesmo critério de school_meters).
drop policy if exists "school_water_exemptions_select" on public.school_water_exemptions;
create policy "school_water_exemptions_select" on public.school_water_exemptions
  for select to authenticated
  using (auth.role() = 'authenticated');

-- Gestão (dispensar / remover dispensa): só regional_admin e dirigente,
-- espelhando a policy "Gestão de hidrômetros".
drop policy if exists "school_water_exemptions_manage" on public.school_water_exemptions;
create policy "school_water_exemptions_manage" on public.school_water_exemptions
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('regional_admin', 'dirigente')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('regional_admin', 'dirigente')
    )
  );

-- Mesma proteção de escrita das demais tabelas (chefe_departamento e
-- outros papéis somente-leitura não escrevem em lugar nenhum).
drop trigger if exists trg_block_write_readonly on public.school_water_exemptions;
create trigger trg_block_write_readonly
  before insert or update or delete on public.school_water_exemptions
  for each row execute function public.block_write_for_readonly_roles();

grant all on table public.school_water_exemptions to anon, authenticated, service_role;

-- ── Cache derivado schools.water_exempt ──────────────────────────────────
-- Mantém schools.water_exempt = "existe período de dispensa em aberto".
create or replace function public.sync_school_water_exempt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_id uuid := coalesce(NEW.school_id, OLD.school_id);
begin
  update public.schools s
     set water_exempt = exists (
       select 1 from public.school_water_exemptions e
       where e.school_id = v_school_id and e.end_date is null
     )
   where s.id = v_school_id;
  return null;
end;
$$;

drop trigger if exists trg_sync_school_water_exempt on public.school_water_exemptions;
create trigger trg_sync_school_water_exempt
  after insert or update or delete on public.school_water_exemptions
  for each row execute function public.sync_school_water_exempt();

-- ── Backfill ─────────────────────────────────────────────────────────────
-- Toda escola hoje marcada como isenta ganha um período em aberto começando
-- em 01/05/2026 (piso de reporte de consumo de água). Usar o piso preserva
-- o comportamento atual: todos os dias passados que hoje aparecem como
-- "Dispensada" no calendário continuam assim. O início real histórico é
-- desconhecido; o piso é a escolha segura.
insert into public.school_water_exemptions (school_id, start_date, end_date, created_by)
select s.id, date '2026-05-01', null, null
from public.schools s
where coalesce(s.water_exempt, false) = true
  and not exists (
    select 1 from public.school_water_exemptions e
    where e.school_id = s.id and e.end_date is null
  );
