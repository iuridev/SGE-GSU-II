-- Rastreia se um evento do Calendário (meetings) já foi sincronizado com a aba
-- "Atendimentos_Teams" da planilha usada pela página "Atendimento Patrimônio",
-- para não duplicar a linha na planilha a cada edição do mesmo evento.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'patrimonio_atendimento_id'
  ) THEN
    ALTER TABLE meetings ADD COLUMN patrimonio_atendimento_id text;
  END IF;
END $$;

COMMENT ON COLUMN meetings.patrimonio_atendimento_id IS 'ID da linha correspondente na aba Atendimentos_Teams da planilha (Google Sheets), quando event_type = PATRIMONIO. Nulo se ainda não sincronizado.';
