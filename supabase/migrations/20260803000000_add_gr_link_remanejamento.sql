-- Link externo (Google Drive) para a Guia de Remanejamento (GR) do lote,
-- exibido como botão "GR" no card do lote para visualização rápida do documento.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'gr_link'
  ) THEN
    ALTER TABLE inventory_items ADD COLUMN gr_link text;
  END IF;
END $$;

COMMENT ON COLUMN inventory_items.gr_link IS 'URL externa (Google Drive) da Guia de Remanejamento do lote. Nulo quando o lote não possui guia cadastrada.';
