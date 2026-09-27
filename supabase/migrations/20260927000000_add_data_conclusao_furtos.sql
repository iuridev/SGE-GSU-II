-- Data em que a situação do processo de furto/roubo/extravio virou "Concluído".
-- updated_at é tocado em QUALQUER edição do processo (não só quando a situação
-- muda para Concluído), então não serve para saber quando a conclusão realmente
-- aconteceu — esta coluna é preenchida pelo frontend só nessa transição (mesmo
-- padrão de data_cadastro_sam em patrimonio-atendimento), nunca sobrescrita numa
-- edição comum que mantém a situação já concluída.
alter table public.processos_furtos add column if not exists data_conclusao timestamptz;
