-- Fix 2: a correção anterior (20260817010000) tirou a recursão dentro da
-- própria signature_signers, mas sobrou um ciclo ENTRE as duas tabelas:
-- signature_documents_select consulta signature_signers direto num EXISTS,
-- e signature_signers_select consultava signature_documents direto num
-- EXISTS pro "sou o criador" — cada uma reaplicando a RLS da outra e
-- voltando pra primeira, gerando "infinite recursion detected in policy
-- for relation signature_documents".
--
-- Solução: toda checagem cruzada entre as duas tabelas passa a usar uma
-- função SECURITY DEFINER (que não reaplica RLS internamente), igual já
-- foi feito pra "sou signatário" em is_signature_signer.
create or replace function public.is_signature_document_creator(p_document_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.signature_documents
    where id = p_document_id and created_by = p_profile_id
  );
$$;

grant execute on function public.is_signature_document_creator(uuid, uuid) to authenticated;

drop policy if exists "signature_documents_select" on public.signature_documents;
create policy "signature_documents_select" on public.signature_documents
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('regional_admin', 'chefe_departamento', 'dirigente')
    )
    or public.is_signature_signer(signature_documents.id, auth.uid())
  );

drop policy if exists "signature_signers_select" on public.signature_signers;
create policy "signature_signers_select" on public.signature_signers
  for select to authenticated
  using (
    public.is_signature_signer(document_id, auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('regional_admin', 'chefe_departamento', 'dirigente')
    )
    or public.is_signature_document_creator(document_id, auth.uid())
  );
