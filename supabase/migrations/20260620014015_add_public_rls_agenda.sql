-- Leitura pública (anon) dos ambientes ativos — necessário para QR Code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ambientes' AND policyname = 'Leitura pública de ambientes'
  ) THEN
    CREATE POLICY "Leitura pública de ambientes"
    ON ambientes FOR SELECT TO anon
    USING (ativo = true);
  END IF;
END $$;

-- Leitura pública (anon) dos agendamentos aprovados/pendentes — necessário para QR Code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agendamentos_ambientes' AND policyname = 'Leitura pública de agendamentos'
  ) THEN
    CREATE POLICY "Leitura pública de agendamentos"
    ON agendamentos_ambientes FOR SELECT TO anon
    USING (status IN ('aprovado', 'pendente'));
  END IF;
END $$;
