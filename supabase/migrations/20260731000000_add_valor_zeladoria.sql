-- Nova etapa "11 - SEFREP" no fluxo de zeladorias: o SEFREP cadastra o
-- valor do desconto de Zeladoria na folha de pagamento do servidor. Este
-- valor é informado no momento do envio para essa etapa (pulada quando o
-- servidor é isento, identificado pelo campo dare contendo "isento").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zeladorias' AND column_name = 'valor_zeladoria'
  ) THEN
    ALTER TABLE zeladorias ADD COLUMN valor_zeladoria numeric;
  END IF;
END $$;

COMMENT ON COLUMN zeladorias.valor_zeladoria IS 'Valor do desconto de Zeladoria informado ao enviar o processo para a etapa SEFREP, para cadastro na folha de pagamento do servidor. Nulo quando o servidor é isento ou o valor ainda não foi informado.';
