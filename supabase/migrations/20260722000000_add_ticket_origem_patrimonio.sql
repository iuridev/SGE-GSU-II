-- Permite que um chamado (internal_tickets) referencie o atendimento ou
-- remanejamento de patrimônio que motivou a abertura, para o regional_admin
-- saber exatamente do que a escola está falando ao responder.
-- origem_id não é FK de Postgres pois atendimentos/remanejamentos vivem na
-- planilha Google Sheets (patrimonio-atendimento), não em tabela do banco.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_tickets' AND column_name = 'origem_tipo'
  ) THEN
    ALTER TABLE internal_tickets ADD COLUMN origem_tipo text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_tickets' AND column_name = 'origem_id'
  ) THEN
    ALTER TABLE internal_tickets ADD COLUMN origem_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_tickets' AND column_name = 'origem_label'
  ) THEN
    ALTER TABLE internal_tickets ADD COLUMN origem_label text;
  END IF;
END $$;

COMMENT ON COLUMN internal_tickets.origem_tipo IS 'Tipo do registro de patrimônio que originou o chamado: "atendimento" ou "remanejamento". Nulo para chamados abertos sem referência.';
COMMENT ON COLUMN internal_tickets.origem_id IS 'ID (na planilha Google Sheets de Atendimento Patrimônio) do atendimento/remanejamento referenciado.';
COMMENT ON COLUMN internal_tickets.origem_label IS 'Descrição legível do atendimento/remanejamento referenciado, para exibição direta sem precisar consultar a planilha.';
