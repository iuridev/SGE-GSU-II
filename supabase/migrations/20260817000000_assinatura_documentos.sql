-- Assinatura eletrônica de documentos PDF: um documento é enviado por um
-- admin/dirigente, um ou mais usuários são escolhidos como signatários, e
-- cada um "assina" (grava nome/cargo/data/hora + código de verificação).
-- Quando o último assina, o app gera (client-side, com pdf-lib) o PDF final
-- com o certificado de assinatura no rodapé de cada página.
create table if not exists public.signature_documents (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  original_path text not null,
  signed_path text,
  status text not null default 'pendente' check (status in ('pendente', 'concluido', 'cancelado')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  concluded_at timestamptz
);

create table if not exists public.signature_signers (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.signature_documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  status text not null default 'pendente' check (status in ('pendente', 'assinado')),
  signed_at timestamptz,
  verification_code text,
  created_at timestamptz not null default now(),
  unique (document_id, profile_id)
);

create index if not exists signature_signers_document_id_idx on public.signature_signers(document_id);
create index if not exists signature_signers_profile_id_idx on public.signature_signers(profile_id);
create index if not exists signature_signers_pending_idx on public.signature_signers(profile_id) where status = 'pendente';

alter table public.signature_documents enable row level security;
alter table public.signature_signers enable row level security;

-- Papéis que podem criar solicitações de assinatura. chefe_departamento é
-- somente-leitura em todo o banco (ver 20260713010000_add_read_only_role_write_block.sql)
-- e por isso fica de fora, igual ao padrão já usado em admin_alerts.
drop policy if exists "signature_documents_insert_admin" on public.signature_documents;
create policy "signature_documents_insert_admin" on public.signature_documents
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('regional_admin', 'dirigente')
    )
  );

-- SELECT: quem administra vê tudo (chefe_departamento incluso, só leitura);
-- criador e signatários veem os documentos em que estão envolvidos.
drop policy if exists "signature_documents_select" on public.signature_documents;
create policy "signature_documents_select" on public.signature_documents
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('regional_admin', 'chefe_departamento', 'dirigente')
    )
    or exists (
      select 1 from public.signature_signers s
      where s.document_id = signature_documents.id and s.profile_id = auth.uid()
    )
  );

-- UPDATE: só quem criou (para concluir o documento e gravar signed_path).
drop policy if exists "signature_documents_update_creator" on public.signature_documents;
create policy "signature_documents_update_creator" on public.signature_documents
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "signature_signers_insert_admin" on public.signature_signers;
create policy "signature_signers_insert_admin" on public.signature_signers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.signature_documents d
      where d.id = signature_signers.document_id and d.created_by = auth.uid()
    )
  );

-- Qualquer signatário de um documento enxerga a linha de todos os outros
-- signatários do mesmo documento (pra saber quem falta assinar), não só a
-- própria — igual a qualquer ferramenta de assinatura eletrônica.
drop policy if exists "signature_signers_select" on public.signature_signers;
create policy "signature_signers_select" on public.signature_signers
  for select to authenticated
  using (
    exists (
      select 1 from public.signature_signers s2
      where s2.document_id = signature_signers.document_id and s2.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('regional_admin', 'chefe_departamento', 'dirigente')
    )
    or exists (
      select 1 from public.signature_documents d
      where d.id = signature_signers.document_id and d.created_by = auth.uid()
    )
  );

-- UPDATE: cada signatário só assina a própria linha (marca status/assinado
-- e o código de verificação); chefe_departamento nunca cai aqui pois o
-- trigger de somente-leitura abaixo bloqueia antes.
drop policy if exists "signature_signers_update_own" on public.signature_signers;
create policy "signature_signers_update_own" on public.signature_signers
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Conclui o documento quando o último signatário assina. Roda como
-- SECURITY DEFINER porque quem chama (o último a assinar) pode não ser o
-- criador do documento — a policy de UPDATE em signature_documents só
-- permite o criador, então a validação "sou signatário e todos já
-- assinaram" é feita aqui dentro, e auth.uid() continua sendo o usuário
-- real da sessão (não o dono da função), então o trigger de somente-leitura
-- do chefe_departamento continua valendo normalmente.
create or replace function public.finalize_signature_document(p_document_id uuid, p_signed_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.signature_signers
    where document_id = p_document_id and profile_id = auth.uid()
  ) then
    raise exception 'Você não é signatário deste documento.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.signature_signers
    where document_id = p_document_id and status <> 'assinado'
  ) then
    raise exception 'Ainda há signatários pendentes.' using errcode = '42501';
  end if;

  update public.signature_documents
  set status = 'concluido', signed_path = p_signed_path, concluded_at = now()
  where id = p_document_id;
end;
$$;

grant execute on function public.finalize_signature_document(uuid, text) to authenticated;

-- Mesma proteção de escrita das demais tabelas: chefe_departamento nunca
-- escreve, nem aqui (ver 20260713010000_add_read_only_role_write_block.sql).
drop trigger if exists trg_block_write_readonly on public.signature_documents;
create trigger trg_block_write_readonly before insert or update or delete on public.signature_documents
  for each row execute function public.block_write_for_readonly_roles();

drop trigger if exists trg_block_write_readonly on public.signature_signers;
create trigger trg_block_write_readonly before insert or update or delete on public.signature_signers
  for each row execute function public.block_write_for_readonly_roles();

-- Bucket privado (documentos sensíveis) — leitura/escrita só para quem
-- participa do documento (criador, signatário, ou admin/dirigente/chefe),
-- via signed URL gerada no app. Caminho dos arquivos: "{document_id}/original.pdf"
-- e "{document_id}/assinado.pdf", daí o uso de storage.foldername(name).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assinaturas', 'assinaturas', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "assinaturas_select_participantes" on storage.objects;
create policy "assinaturas_select_participantes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assinaturas'
    and exists (
      select 1 from public.signature_documents d
      where d.id::text = (storage.foldername(name))[1]
        and (
          d.created_by = auth.uid()
          or exists (select 1 from public.signature_signers s where s.document_id = d.id and s.profile_id = auth.uid())
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('regional_admin', 'chefe_departamento', 'dirigente'))
        )
    )
  );

-- INSERT: o criador sobe o original (a linha em signature_documents já
-- existe nesse momento, criada antes do upload); qualquer signatário pode
-- gravar o PDF final quando conclui a última assinatura.
drop policy if exists "assinaturas_insert_participantes" on storage.objects;
create policy "assinaturas_insert_participantes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assinaturas'
    and exists (
      select 1 from public.signature_documents d
      where d.id::text = (storage.foldername(name))[1]
        and (
          d.created_by = auth.uid()
          or exists (select 1 from public.signature_signers s where s.document_id = d.id and s.profile_id = auth.uid())
        )
    )
  );
