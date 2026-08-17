-- Fix: a policy de SELECT em signature_signers consultava a própria tabela
-- num EXISTS pra checar "sou signatário deste documento". O Postgres trata
-- isso como recursão infinita em RLS ("infinite recursion detected in
-- policy for relation signature_signers"), o que derrubava com erro 500
-- até consultas simples em signature_documents (cuja policy também faz um
-- EXISTS em signature_signers) e os uploads no bucket "assinaturas" (cuja
-- policy de INSERT em storage.objects também consulta signature_signers).
--
-- A correção é mover essa checagem pra dentro de uma função SECURITY
-- DEFINER: ela roda com os privilégios do dono da tabela, que por padrão
-- não sofre RLS, então a consulta interna não reaplica (e não recursiona)
-- a policy de signature_signers.
create or replace function public.is_signature_signer(p_document_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.signature_signers
    where document_id = p_document_id and profile_id = p_profile_id
  );
$$;

grant execute on function public.is_signature_signer(uuid, uuid) to authenticated;

drop policy if exists "signature_signers_select" on public.signature_signers;
create policy "signature_signers_select" on public.signature_signers
  for select to authenticated
  using (
    public.is_signature_signer(document_id, auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('regional_admin', 'chefe_departamento', 'dirigente')
    )
    or exists (
      select 1 from public.signature_documents d
      where d.id = signature_signers.document_id and d.created_by = auth.uid()
    )
  );

-- Faltava a policy de DELETE em signature_documents: o app tenta apagar a
-- linha do documento se o upload do PDF original ou a inserção dos
-- signatários falhar logo após criá-lo (rollback), e sem policy o DELETE
-- não tinha efeito nenhum.
drop policy if exists "signature_documents_delete_creator" on public.signature_documents;
create policy "signature_documents_delete_creator" on public.signature_documents
  for delete to authenticated
  using (created_by = auth.uid());
