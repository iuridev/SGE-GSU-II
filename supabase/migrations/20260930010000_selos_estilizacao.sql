-- Mais opções de aparência para os Selos de Excelência: formato (círculo,
-- escudo, hexágono, roseta...) e acabamento (degradê, cor sólida, contorno).
-- As chaves são resolvidas em src/components/SeloBadge.tsx.
alter table public.selos add column if not exists formato text not null default 'circulo';
alter table public.selos add column if not exists acabamento text not null default 'gradiente';
