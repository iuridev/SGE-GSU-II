-- Métricas de acesso ao SGE (App.tsx): registra logins e navegação entre
-- páginas para alimentar a página "Métricas de Acesso" (src/pages/MetricasAcesso.tsx).
-- Não existia nenhum rastreamento de acesso antes desta migration.
create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('login', 'page_view')),
  page text,
  created_at timestamptz not null default now()
);

create index if not exists access_logs_user_id_idx on public.access_logs(user_id);
create index if not exists access_logs_created_at_idx on public.access_logs(created_at);
create index if not exists access_logs_event_type_idx on public.access_logs(event_type);

alter table public.access_logs enable row level security;

-- Qualquer usuário autenticado pode registrar a própria atividade (login ou
-- navegação); nunca em nome de outro usuário.
drop policy if exists "access_logs_insert_own" on public.access_logs;
create policy "access_logs_insert_own" on public.access_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Leitura restrita aos mesmos perfis que enxergam a página de métricas no
-- menu (App.tsx): todos exceto school_manager.
drop policy if exists "access_logs_select_admins" on public.access_logs;
create policy "access_logs_select_admins" on public.access_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('regional_admin', 'chefe_departamento', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc')
    )
  );

-- Mesma proteção de escrita aplicada às demais tabelas do schema (ver
-- migration 20260713010000_add_read_only_role_write_block.sql): o papel
-- somente-leitura (chefe_departamento) não escreve em lugar nenhum, nem para
-- registrar a própria atividade.
drop trigger if exists trg_block_write_readonly on public.access_logs;
create trigger trg_block_write_readonly before insert or update or delete on public.access_logs
  for each row execute function public.block_write_for_readonly_roles();
