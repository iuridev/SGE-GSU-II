-- Correção de dados: todos os processos lançados como "Doação PDDE" eram, na
-- verdade, "Doação de Material Permanente". Passam para DOACAO_MAT_PERMANENTE
-- na etapa "FILA DE ATENDIMENTO" (primeira etapa do novo fluxo). Os já
-- concluídos vão para a etapa "CONCLUÍDO" do novo fluxo, para não aparecerem
-- com progresso de 1ª etapa.
--
-- Backup dos valores originais em asset_processes_backup_pdde_20261015, para
-- desfazer se necessário:
--   update public.asset_processes a set type = b.type, current_step = b.current_step
--   from public.asset_processes_backup_pdde_20261015 b where a.id = b.id;

create table if not exists public.asset_processes_backup_pdde_20261015 as
  select id, type, current_step, status, now() as backup_em
  from public.asset_processes
  where type = 'DOACAO_PDDE';

alter table public.asset_processes_backup_pdde_20261015 enable row level security;

update public.asset_processes
set type = 'DOACAO_MAT_PERMANENTE',
    current_step = case when status = 'CONCLUÍDO' then 'CONCLUÍDO' else 'FILA DE ATENDIMENTO' end
where type = 'DOACAO_PDDE';
