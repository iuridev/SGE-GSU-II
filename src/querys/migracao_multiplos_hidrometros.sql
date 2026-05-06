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

-- Index para busca por escola
CREATE INDEX IF NOT EXISTS idx_school_meters_school_id ON school_meters(school_id);

-- 2. Adicionar coluna meter_id na tabela consumo_agua (nullable para retrocompatibilidade)
ALTER TABLE consumo_agua 
  ADD COLUMN IF NOT EXISTS meter_id UUID REFERENCES school_meters(id) ON DELETE SET NULL;

-- 3. Remover a constraint antiga de unique (school_id, date) se existir
-- (pode falhar se não existir — ignorar o erro)
ALTER TABLE consumo_agua DROP CONSTRAINT IF EXISTS consumo_agua_school_id_date_key;

-- 4. Criar nova constraint unique que inclui meter_id
-- Usamos uma partial unique index para lidar com meter_id NULL (retrocompat)
-- Registros antigos (meter_id IS NULL): 1 por escola/data
-- Registros novos (meter_id NOT NULL): 1 por escola/data/meter
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumo_agua_school_date_meter_null 
  ON consumo_agua(school_id, date) 
  WHERE meter_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumo_agua_school_date_meter 
  ON consumo_agua(school_id, date, meter_id) 
  WHERE meter_id IS NOT NULL;

-- 5. RLS Policies para school_meters
ALTER TABLE school_meters ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado pode ver hidrômetros ativos
CREATE POLICY "Leitura de hidrômetros" ON school_meters
  FOR SELECT USING (auth.role() = 'authenticated');

-- Escrita: apenas regional_admin e dirigente podem gerenciar
CREATE POLICY "Gestão de hidrômetros" ON school_meters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('regional_admin', 'dirigente')
    )
  );

-- ============================================================
-- PRONTO!
-- Escolas com 1 hidrômetro: continuam funcionando normalmente
-- (meter_id = NULL nos registros antigos)
-- 
-- Para escolas com múltiplos hidrômetros:
-- O admin cadastra na tabela school_meters e a UI
-- apresenta seleção de hidrômetro no modal de registro.
-- ============================================================
