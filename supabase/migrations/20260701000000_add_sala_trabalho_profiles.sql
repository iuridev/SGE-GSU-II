-- Vínculo de sala de trabalho fixa (patrimônio) para usuários ure_servico
-- O valor guardado é o "id" da sala cadastrada na aba "Salas" da planilha de patrimônio,
-- não uma FK de Postgres, pois a lista de salas vive na planilha (decisão do produto).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'sala_trabalho'
  ) THEN
    ALTER TABLE profiles ADD COLUMN sala_trabalho text;
  END IF;
END $$;

COMMENT ON COLUMN profiles.sala_trabalho IS 'ID da sala (aba "Salas" da planilha de patrimônio) vinculada ao usuário ure_servico. Nulo para demais roles.';
