-- Calcula, por escola, quais meses (dentro de uma janela informada) têm pelo menos
-- um dia útil sem registro de consumo de água em `consumo_agua`.
-- Roda dentro do Postgres (SECURITY DEFINER, ignora RLS por escola) e devolve
-- só o resultado agregado (poucas linhas), evitando trafegar milhares de
-- registros diários para o front-end a cada carregamento da Dashboard.
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
  eligible_schools as (
    select id, name
    from schools
    where coalesce(water_exempt, false) = false
  ),
  expected as (
    select s.id as school_id, s.name as school_name, b.day
    from eligible_schools s
    cross join business_days b
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
