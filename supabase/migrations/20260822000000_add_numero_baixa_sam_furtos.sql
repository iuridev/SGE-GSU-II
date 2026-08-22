-- Baixa patrimonial de processos de furto agora exige dois documentos:
-- o registro de Baixa no SAM Patrimônio (nesta nova coluna) e o número da
-- NL (coluna nl_baixa já existente), emitido posteriormente pelo SEAFIN.
-- Quando apenas o SAM estiver preenchido, a baixa fica pendente no SEAFIN.
alter table public.processos_furtos add column if not exists numero_baixa_sam text;
