-- Bucket para anexos (fotos, PDFs) de ocorrências do módulo de Fiscalização
-- de Serviços Terceirizados. Nasce já restrito a imagem/PDF (mesma restrição
-- aplicada posteriormente ao bucket do Plano de Ação).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fiscalizacao-terceirizados-evidencias',
  'fiscalizacao-terceirizados-evidencias',
  true,
  10485760,  -- 10 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (qualquer um com o link pode ver/baixar o anexo)
CREATE POLICY "fiscalizacao_terceirizados_evidencias_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fiscalizacao-terceirizados-evidencias');

-- Upload apenas para usuários autenticados
CREATE POLICY "fiscalizacao_terceirizados_evidencias_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fiscalizacao-terceirizados-evidencias' AND auth.role() = 'authenticated');

-- Delete apenas para usuários autenticados
CREATE POLICY "fiscalizacao_terceirizados_evidencias_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'fiscalizacao-terceirizados-evidencias' AND auth.role() = 'authenticated');
