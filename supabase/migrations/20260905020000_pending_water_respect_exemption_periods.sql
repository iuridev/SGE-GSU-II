-- get_pending_water_schools passa a respeitar os PERÍODOS de dispensa
-- (school_water_exemptions) em vez de excluir a escola inteira pelo
-- booleano schools.water_exempt.
--
-- ANTES: uma escola com water_exempt = true saía completamente do cálculo,
-- inclusive nos meses em que ela NÃO estava dispensada.
-- AGORA: a escola entra no cálculo normalmente, mas os dias que caem dentro
-- de um período de dispensa (start_date .. end_date, com end_date null
-- tratado como "até hoje") não são cobrados.
--
-- Reflete automaticamente na Dashboard (fetchPendingWaterSchools) e em
-- Pendências Semanais (gerarSnapshot), que consomem essa mesma RPC.

create or replace function public.get_pending_water_schools(
  p_window_start date,
  p_today date
)
returns table (
  school_id uuid,
  school_name text,
  year integer,
  month integer,
  missing_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  with suspended_dates as (
    select distinct date
    from consumo_agua
    where meter_id is null
      and justification like 'Suspensão de Expediente:%'
      and date between p_window_start and p_today
  ),
  business_days as (
    select gs::date as day
    from generate_series(p_window_start::timestamp, p_today::timestamp, interval '1 day') as gs
    where extract(dow from gs) not in (0, 6)
      and gs::date not in (select date from suspended_dates)
  ),
  exemptions as (
    select school_id, start_date, coalesce(end_date, p_today) as end_date
    from school_water_exemptions
  ),
  expected as (
    select s.id as school_id, s.name as school_name, b.day
    from schools s
    cross join business_days b
    where not exists (
      select 1 from exemptions x
      where x.school_id = s.id
        and b.day between x.start_date and x.end_date
    )
  ),
  registered as (
    select distinct school_id, date
    from consumo_agua
    where date between p_window_start and p_today
  )
  select
    e.school_id,
    e.school_name,
    extract(year from e.day)::int as year,
    extract(month from e.day)::int as month,
    count(*)::int as missing_days
  from expected e
  left join registered r
    on r.school_id = e.school_id and r.date = e.day
  where r.date is null
  group by e.school_id, e.school_name, extract(year from e.day), extract(month from e.day)
  having count(*) > 0
  order by e.school_name, 3, 4;
$$;

grant execute on function public.get_pending_water_schools(date, date) to authenticated;
