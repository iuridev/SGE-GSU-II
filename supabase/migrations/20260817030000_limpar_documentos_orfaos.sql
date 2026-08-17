-- Limpeza pontual: dois documentos de teste criados antes dos fixes de
-- recursão de RLS (20260817010000 e 20260817020000) ficaram órfãos — o
-- upload do PDF original falhou por causa do bug, e o rollback automático
-- também falhou silenciosamente (sem tratamento de erro na época), então a
-- linha nunca foi removida. Nenhum arquivo correspondente existe no bucket
-- "assinaturas" (confirmado via storage.objects), então não têm como ser
-- recuperados — só remover.
delete from public.signature_documents
where id in ('06f6ed8d-0b97-417b-8235-bdb01fee8d87', '02e91064-d9cc-4806-8eef-00fb2b6a129e')
  and signed_path is null;
