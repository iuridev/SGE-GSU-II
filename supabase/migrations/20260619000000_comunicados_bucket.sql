-- Cria bucket público para imagens dos comunicados
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comunicados',
  'comunicados',
  true,
  4194304,  -- 4 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (qualquer um pode ver as imagens)
CREATE POLICY "comunicados_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comunicados');

-- Upload apenas para usuários autenticados
CREATE POLICY "comunicados_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'comunicados' AND auth.role() = 'authenticated');

-- Delete apenas para usuários autenticados
CREATE POLICY "comunicados_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'comunicados' AND auth.role() = 'authenticated');
