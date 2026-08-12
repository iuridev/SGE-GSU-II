-- Cria bucket para evidências (fotos, PDFs, documentos) das etapas do Plano de Ação
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'plano-acao-evidencias',
  'plano-acao-evidencias',
  true,
  10485760,  -- 10 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (qualquer um com o link pode ver/baixar a evidência)
CREATE POLICY "plano_acao_evidencias_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'plano-acao-evidencias');

-- Upload apenas para usuários autenticados
CREATE POLICY "plano_acao_evidencias_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'plano-acao-evidencias' AND auth.role() = 'authenticated');

-- Delete apenas para usuários autenticados
CREATE POLICY "plano_acao_evidencias_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'plano-acao-evidencias' AND auth.role() = 'authenticated');
