-- Fluxo de Doação de Material Permanente ganhou a etapa "Despacho do
-- Coordenador Geral - Dirigente", que registra a data de publicação no DOE.
alter table public.asset_processes add column if not exists doe_date date;
