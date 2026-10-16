-- Nº da nota fiscal de cada item a incorporar. Os itens moram na planilha
-- "Itens a Incorporar" (edge function patrimonio-atendimento), que só guarda o
-- link da NF; o número fica aqui, ligado ao id do item na planilha (sem FK).
-- Informado no modal do processo de Doação de Material Permanente e impresso
-- nos PDFs do processo.

create table if not exists public.patrimonio_itens_nota_fiscal (
  item_id text primary key,
  numero_nota_fiscal text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.patrimonio_itens_nota_fiscal is 'Nº da nota fiscal por item a incorporar (id da linha na planilha Itens a Incorporar).';

alter table public.patrimonio_itens_nota_fiscal enable row level security;

drop policy if exists "patrimonio_itens_nota_fiscal: leitura" on public.patrimonio_itens_nota_fiscal;
create policy "patrimonio_itens_nota_fiscal: leitura" on public.patrimonio_itens_nota_fiscal
  for select to authenticated
  using (true);

drop policy if exists "patrimonio_itens_nota_fiscal: escrita admin" on public.patrimonio_itens_nota_fiscal;
create policy "patrimonio_itens_nota_fiscal: escrita admin" on public.patrimonio_itens_nota_fiscal
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ));

drop trigger if exists trg_block_write_readonly on public.patrimonio_itens_nota_fiscal;
create trigger trg_block_write_readonly before insert or delete or update
  on public.patrimonio_itens_nota_fiscal for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.patrimonio_itens_nota_fiscal to authenticated;
grant all on table public.patrimonio_itens_nota_fiscal to service_role;
