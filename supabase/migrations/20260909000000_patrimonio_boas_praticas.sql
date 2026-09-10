-- Biblioteca de Boas Práticas de controle de mobiliário patrimonial.
-- Uma escola publica algo que funcionou (texto + fotos/PDF) e as demais
-- escolas podem ver e marcar que replicaram na própria unidade. O objetivo
-- é disseminar boas práticas de gestão pela rede. É a nova função da página
-- "Educação Patrimonial" (o painel de ocorrências patrimoniais continua).

create table if not exists public.patrimonial_best_practices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  author_id uuid references public.profiles(id),
  author_name text,
  title text not null,
  description text not null,
  category text,
  -- [{ url, name, type }] — fotos e PDFs no bucket patrimonial-boas-praticas
  attachments jsonb not null default '[]'::jsonb,
  -- regional pode destacar as práticas mais relevantes
  is_featured boolean not null default false
);

-- Uma linha por escola que replicou a prática. UNIQUE evita replicação
-- duplicada e o count vira o "N escolas replicaram" exibido no card.
create table if not exists public.patrimonial_best_practice_replications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  practice_id uuid not null references public.patrimonial_best_practices(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references public.profiles(id),
  user_name text,
  unique (practice_id, school_id)
);

create index if not exists patrimonial_best_practices_school_idx
  on public.patrimonial_best_practices(school_id);
create index if not exists pbp_replications_practice_idx
  on public.patrimonial_best_practice_replications(practice_id);
create index if not exists pbp_replications_school_idx
  on public.patrimonial_best_practice_replications(school_id);

alter table public.patrimonial_best_practices enable row level security;
alter table public.patrimonial_best_practice_replications enable row level security;

-- Políticas permissivas, no mesmo espírito das tabelas patrimonial_* já
-- existentes ("Acesso total ..."): leitura para toda a rede, escrita para
-- qualquer usuário autenticado. O controle fino de quem publica / cura fica
-- no frontend; o chefe_departamento (somente-leitura) é barrado pelo trigger
-- trg_block_write_readonly abaixo.
drop policy if exists "patrimonial_best_practices_select" on public.patrimonial_best_practices;
create policy "patrimonial_best_practices_select" on public.patrimonial_best_practices
  for select to authenticated using (true);

drop policy if exists "patrimonial_best_practices_write" on public.patrimonial_best_practices;
create policy "patrimonial_best_practices_write" on public.patrimonial_best_practices
  for all to authenticated using (true) with check (true);

drop policy if exists "pbp_replications_select" on public.patrimonial_best_practice_replications;
create policy "pbp_replications_select" on public.patrimonial_best_practice_replications
  for select to authenticated using (true);

drop policy if exists "pbp_replications_write" on public.patrimonial_best_practice_replications;
create policy "pbp_replications_write" on public.patrimonial_best_practice_replications
  for all to authenticated using (true) with check (true);

-- Mesma proteção de escrita das demais tabelas (ver migration
-- 20260713010000_add_read_only_role_write_block.sql): chefe_departamento
-- não escreve em lugar nenhum.
drop trigger if exists trg_block_write_readonly on public.patrimonial_best_practices;
create trigger trg_block_write_readonly before insert or update or delete
  on public.patrimonial_best_practices
  for each row execute function public.block_write_for_readonly_roles();

drop trigger if exists trg_block_write_readonly on public.patrimonial_best_practice_replications;
create trigger trg_block_write_readonly before insert or update or delete
  on public.patrimonial_best_practice_replications
  for each row execute function public.block_write_for_readonly_roles();

-- Bucket para as fotos/PDFs das boas práticas (espelha plano-acao-evidencias).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patrimonial-boas-praticas',
  'patrimonial-boas-praticas',
  true,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "patrimonial_boas_praticas_public_read" on storage.objects;
create policy "patrimonial_boas_praticas_public_read"
  on storage.objects for select
  using (bucket_id = 'patrimonial-boas-praticas');

drop policy if exists "patrimonial_boas_praticas_auth_insert" on storage.objects;
create policy "patrimonial_boas_praticas_auth_insert"
  on storage.objects for insert
  with check (bucket_id = 'patrimonial-boas-praticas' and auth.role() = 'authenticated');

drop policy if exists "patrimonial_boas_praticas_auth_delete" on storage.objects;
create policy "patrimonial_boas_praticas_auth_delete"
  on storage.objects for delete
  using (bucket_id = 'patrimonial-boas-praticas' and auth.role() = 'authenticated');
