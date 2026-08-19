-- Código UA (Unidade Administrativa) da escola — código próprio, diferente do
-- Código CIE e do Código FDE já existentes, usado por outros sistemas da
-- SEDUC/FDE. Coluna nullable simples, mesmo padrão de cie_code/fde_code.
alter table public.schools add column if not exists ua_code text;
