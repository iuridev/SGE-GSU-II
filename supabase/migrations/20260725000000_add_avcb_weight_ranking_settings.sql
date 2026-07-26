-- Adiciona o peso do pilar AVCB (Auto de Vistoria do Corpo de Bombeiros) ao
-- ranking do GSU. AVCB passa a ser o 6º pilar dentro dos 10 pontos: escola com
-- AVCB válido pontua 100% do peso, sem registro fica em 50% (neutro) e vencido
-- fica em 0% do peso deste pilar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ranking_settings' AND column_name = 'avcb'
  ) THEN
    ALTER TABLE ranking_settings ADD COLUMN avcb numeric NOT NULL DEFAULT 1.7;
  END IF;
END $$;

COMMENT ON COLUMN ranking_settings.avcb IS 'Peso (0 a 10) do pilar AVCB no cálculo do GSU. Escola com AVCB válido recebe 100% deste peso, sem registro na planilha recebe 50% (neutro) e com AVCB vencido recebe 0%.';
