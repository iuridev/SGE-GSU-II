-- Permite vincular MÚLTIPLAS salas de trabalho a um usuário ure_servico
-- (substitui a coluna anterior "sala_trabalho", que só guardava uma sala)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'salas_trabalho'
  ) THEN
    ALTER TABLE profiles ADD COLUMN salas_trabalho text[];
  END IF;
END $$;

-- Migra o valor único já cadastrado (se houver) para o novo formato em array
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'sala_trabalho'
  ) THEN
    UPDATE profiles
    SET salas_trabalho = ARRAY[sala_trabalho]
    WHERE sala_trabalho IS NOT NULL AND salas_trabalho IS NULL;

    ALTER TABLE profiles DROP COLUMN sala_trabalho;
  END IF;
END $$;

COMMENT ON COLUMN profiles.salas_trabalho IS 'IDs das salas (aba "Salas" da planilha de patrimônio) vinculadas ao usuário ure_servico. Nulo/vazio para demais roles.';
