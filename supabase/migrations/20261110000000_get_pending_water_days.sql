-- Dias úteis sem lançamento de água de UMA escola, um por linha.
--
-- Usa exatamente as mesmas regras de get_pending_water_schools (dias úteis,
-- suspensões de expediente, períodos de dispensa em school_water_exemptions),
-- mas devolve as datas em vez do total por mês. Usada no detalhamento de
-- Pendências Semanais (clicar numa escola pendente mostra os dias em aberto).

create or replace function public.get_pending_water_days(
  p_school_id uuid,
  p_window_start date,
  p_today date
)
returns table (day date)
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
  )
  select b.day
  from business_days b
  where not exists (
      select 1 from school_water_exemptions x
      where x.school_id = p_school_id
        and b.day between x.start_date and coalesce(x.end_date, p_today)
    )
    and not exists (
      select 1 from consumo_agua c
      where c.school_id = p_school_id
        and c.date = b.day
    )
  order by b.day;
$$;

revoke all on function public.get_pending_water_days(uuid, date, date) from public, anon;
grant execute on function public.get_pending_water_days(uuid, date, date) to authenticated;
