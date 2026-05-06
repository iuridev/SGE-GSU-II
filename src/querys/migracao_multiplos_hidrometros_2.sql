-- ============================================================
-- MIGRAÇÃO: Suporte a múltiplos hidrômetros por escola
-- Aplicar no Supabase SQL Editor
-- ============================================================

-- 1. Criar tabela de hidrômetros por escola
CREATE TABLE IF NOT EXISTS school_meters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Hidrômetro Principal',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_school_meters_school_id ON school_meters(school_id);

-- 2. Adicionar coluna meter_id em consumo_agua (nullable para retrocompatibilidade)
ALTER TABLE consumo_agua
  ADD COLUMN IF NOT EXISTS meter_id UUID REFERENCES school_meters(id) ON DELETE SET NULL;

-- 3. Remover TODAS as constraints únicas antigas que conflitam com múltiplos hidrômetros.
--    O nome mais comum é "unique_daily_entry" mas podem existir outros.
--    Execute cada linha — se der "does not exist" é só ignorar.
ALTER TABLE consumo_agua DROP CONSTRAINT IF EXISTS unique_daily_entry;
ALTER TABLE consumo_agua DROP CONSTRAINT IF EXISTS consumo_agua_school_id_date_key;
ALTER TABLE consumo_agua DROP CONSTRAINT IF EXISTS consumo_agua_school_date_meter_unique;
DROP INDEX IF EXISTS idx_consumo_agua_school_date_meter_null;
DROP INDEX IF EXISTS idx_consumo_agua_school_date_meter;

-- Para descobrir o nome exato de todas as constraints da tabela (rode se necessário):
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'consumo_agua'::regclass;

-- 4. Coluna auxiliar para unique constraint com meter_id nullable.
--    UNIQUE(school_id, date, meter_id) no Postgres trata NULL != NULL,
--    então dois meter_id=NULL na mesma escola/data não conflitariam.
--    Solução: coluna gerada que substitui NULL pelo UUID sentinela '000...000'.
ALTER TABLE consumo_agua
  ADD COLUMN IF NOT EXISTS meter_id_key UUID
  GENERATED ALWAYS AS (COALESCE(meter_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

-- 5. Nova constraint única usando a coluna gerada
ALTER TABLE consumo_agua
  ADD CONSTRAINT consumo_agua_school_date_meter_unique
  UNIQUE (school_id, date, meter_id_key);

-- 6. RLS Policies para school_meters
ALTER TABLE school_meters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de hidrômetros" ON school_meters;
CREATE POLICY "Leitura de hidrômetros" ON school_meters
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Gestão de hidrômetros" ON school_meters;
CREATE POLICY "Gestão de hidrômetros" ON school_meters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('regional_admin', 'dirigente')
    )
  );

-- ============================================================
-- VERIFICAÇÃO FINAL — rode após a migração para confirmar:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'consumo_agua'::regclass;
-- Deve aparecer apenas "consumo_agua_school_date_meter_unique" como unique.
-- ============================================================
