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

-- 3. Remover constraints e índices antigos que possam conflitar
ALTER TABLE consumo_agua DROP CONSTRAINT IF EXISTS consumo_agua_school_id_date_key;
DROP INDEX IF EXISTS idx_consumo_agua_school_date_meter_null;
DROP INDEX IF EXISTS idx_consumo_agua_school_date_meter;

-- 4. Coluna auxiliar para tratar NULL como valor fixo na unique constraint.
--    UNIQUE(school_id, date, meter_id) no Postgres trata NULL != NULL,
--    então dois registros com meter_id=NULL na mesma escola/data não conflitariam.
--    Solução: coluna gerada que substitui NULL por um UUID sentinela '000...000'.
ALTER TABLE consumo_agua
  ADD COLUMN IF NOT EXISTS meter_id_key UUID
  GENERATED ALWAYS AS (COALESCE(meter_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

-- 5. Unique constraint usando a coluna gerada
ALTER TABLE consumo_agua
  DROP CONSTRAINT IF EXISTS consumo_agua_school_date_meter_unique;

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
-- O frontend usa SELECT + INSERT/UPDATE em vez de upsert/onConflict,
-- contornando a limitação do Supabase JS com colunas geradas.
-- A constraint garante integridade no banco de dados.
-- ============================================================
