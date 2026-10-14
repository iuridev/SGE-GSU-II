-- Solicitantes dos agendamentos de ambientes.
-- Cada usuário mantém sua própria lista; regional_admin enxerga todos.

create table if not exists public.booking_solicitors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  whatsapp    text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists booking_solicitors_user_idx on public.booking_solicitors (user_id);

comment on table public.booking_solicitors is
  'Solicitantes salvos por usuário para reuso nos agendamentos de ambientes.';

alter table public.booking_solicitors enable row level security;

-- Leitura: próprio usuário vê os seus; admins veem todos.
drop policy if exists "booking_solicitors: leitura" on public.booking_solicitors;
create policy "booking_solicitors: leitura" on public.booking_solicitors
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('regional_admin', 'manage_admin', 'admin', 'chefe_departamento')
    )
  );

-- Escrita: cada usuário gerencia apenas os seus próprios.
drop policy if exists "booking_solicitors: escrita" on public.booking_solicitors;
create policy "booking_solicitors: escrita" on public.booking_solicitors
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Bloqueia escrita para papéis somente-leitura (chefe_departamento).
drop trigger if exists trg_block_write_readonly on public.booking_solicitors;
create trigger trg_block_write_readonly before insert or delete or update
  on public.booking_solicitors for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.booking_solicitors to authenticated;
grant all on table public.booking_solicitors to service_role;

-- ─── Colunas novas em room_schedules ────────────────────────────────────────
-- Agendamentos anteriores ficam com NULL; a partir de agora preenchidos pelo
-- formulário nativo.

alter table public.room_schedules
  add column if not exists solicitor_name     text,
  add column if not exists solicitor_whatsapp text,
  add column if not exists user_id            uuid references auth.users(id);
