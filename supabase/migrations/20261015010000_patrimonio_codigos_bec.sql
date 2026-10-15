-- Catálogo de códigos BEC dos itens a incorporar. Itens com o mesmo nome têm o
-- mesmo código BEC, então o código é guardado por descrição (normalizada no
-- front: minúsculas, sem acento, espaços colapsados) e não em cada linha da
-- planilha "Itens a Incorporar". Informar o código em um item vale para todos
-- os itens com aquele nome, em qualquer processo/escola.

create table if not exists public.patrimonio_codigos_bec (
  descricao_chave text primary key,
  descricao text not null,
  codigo_bec text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.patrimonio_codigos_bec is 'Código BEC por descrição de item (itens com o mesmo nome compartilham o código). Chave = descrição normalizada.';

alter table public.patrimonio_codigos_bec enable row level security;

drop policy if exists "patrimonio_codigos_bec: leitura" on public.patrimonio_codigos_bec;
create policy "patrimonio_codigos_bec: leitura" on public.patrimonio_codigos_bec
  for select to authenticated
  using (true);

drop policy if exists "patrimonio_codigos_bec: escrita admin" on public.patrimonio_codigos_bec;
create policy "patrimonio_codigos_bec: escrita admin" on public.patrimonio_codigos_bec
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ));

drop trigger if exists trg_block_write_readonly on public.patrimonio_codigos_bec;
create trigger trg_block_write_readonly before insert or delete or update
  on public.patrimonio_codigos_bec for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.patrimonio_codigos_bec to authenticated;
grant all on table public.patrimonio_codigos_bec to service_role;
