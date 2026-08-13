-- Restringe o bucket de evidências do Plano de Ação a apenas imagem ou PDF
-- (cada etapa pode ter múltiplas evidências, mas só desses dois tipos)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif',
  'application/pdf'
]
WHERE id = 'plano-acao-evidencias';
