-- As fiscalizações de elevadores passaram a ser gravadas na planilha Google
-- (abas ElevatorInspections / ElevatorInspectionItems), como a fiscalização de
-- Limpeza e Transporte. A tabela criada em 20260926000000 nunca foi usada pelo
-- app nesse formato; só remover se estiver vazia.
do $$
begin
  if to_regclass('public.elevator_inspections') is not null
     and (select count(*) from public.elevator_inspections) = 0 then
    drop table public.elevator_inspections;
  else
    raise notice 'elevator_inspections não removida (tem dados ou não existe).';
  end if;
end $$;
