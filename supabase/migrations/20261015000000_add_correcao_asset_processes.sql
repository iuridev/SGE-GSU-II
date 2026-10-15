-- Processo devolvido à escola para correção (status 'CORREÇÃO'): guarda o
-- motivo informado pela Regional e quando foi devolvido, para medir há quanto
-- tempo a escola não responde. Enquanto estiver em correção o processo sai da
-- fila de atendimento por antiguidade.
alter table public.asset_processes add column if not exists correcao_motivo text;
alter table public.asset_processes add column if not exists correcao_em timestamptz;
