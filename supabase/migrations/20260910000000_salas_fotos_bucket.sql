-- Fotos das salas de trabalho (Patrimônio) — ajudam a identificar a sala e
-- saem no PDF da lista de itens. Máx. 4 fotos por sala; a lista de URLs fica
-- na coluna "fotos" da aba "Salas" da planilha (gerenciada pela edge function
-- patrimonio-salas), não no Postgres. Aqui só criamos o bucket + políticas,
-- no mesmo espírito de patrimonial-boas-praticas / plano-acao-evidencias.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salas-fotos',
  'salas-fotos',
  true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

drop policy if exists "salas_fotos_public_read" on storage.objects;
create policy "salas_fotos_public_read"
  on storage.objects for select
  using (bucket_id = 'salas-fotos');

drop policy if exists "salas_fotos_auth_insert" on storage.objects;
create policy "salas_fotos_auth_insert"
  on storage.objects for insert
  with check (bucket_id = 'salas-fotos' and auth.role() = 'authenticated');

drop policy if exists "salas_fotos_auth_delete" on storage.objects;
create policy "salas_fotos_auth_delete"
  on storage.objects for delete
  using (bucket_id = 'salas-fotos' and auth.role() = 'authenticated');
