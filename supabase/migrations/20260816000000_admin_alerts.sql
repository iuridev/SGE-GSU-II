-- Alerta pop-up de admin/fiscal para escolas específicas, com confirmação
-- de leitura por escola (checklist obrigatório vencido da Fiscalização de
-- Serviços Terceirizados é o primeiro uso, mas a mensagem é livre —
-- reutilizável para outros avisos no futuro).
create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  mensagem text not null,
  criado_por uuid not null references auth.users(id) on delete cascade,
  criado_por_nome text,
  criado_em timestamptz not null default now()
);

-- Uma linha por escola destinatária. visualizado_em nulo = ainda não
-- reconhecida; só é preenchido quando a própria escola clica em "Estou
-- ciente" (nunca por fechar a tela) — é o que dá o "tomou ciência" pro
-- fiscal acompanhar.
create table if not exists public.admin_alert_recipients (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.admin_alerts(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  visualizado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_alert_recipients_alert_id_idx on public.admin_alert_recipients(alert_id);
create index if not exists admin_alert_recipients_school_id_idx on public.admin_alert_recipients(school_id);
create index if not exists admin_alert_recipients_pending_idx on public.admin_alert_recipients(school_id) where visualizado_em is null;

alter table public.admin_alerts enable row level security;
alter table public.admin_alert_recipients enable row level security;

-- Papéis que podem criar e acompanhar alertas (mesmo grupo já usado em
-- access_logs para a página de Métricas de Acesso, menos chefe_departamento
-- nas policies de INSERT porque ele é somente-leitura).
drop policy if exists "admin_alerts_insert_admin" on public.admin_alerts;
create policy "admin_alerts_insert_admin" on public.admin_alerts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('regional_admin', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc')
    )
  );

-- SELECT: quem administra vê tudo; a escola só vê o alerta se tiver uma
-- linha de destinatário correspondente (ou seja, se foi endereçado a ela).
drop policy if exists "admin_alerts_select" on public.admin_alerts;
create policy "admin_alerts_select" on public.admin_alerts
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('regional_admin', 'chefe_departamento', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc')
    )
    or exists (
      select 1 from public.admin_alert_recipients r
      join public.profiles p on p.id = auth.uid()
      where r.alert_id = admin_alerts.id and r.school_id = p.school_id
    )
  );

drop policy if exists "admin_alert_recipients_insert_admin" on public.admin_alert_recipients;
create policy "admin_alert_recipients_insert_admin" on public.admin_alert_recipients
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('regional_admin', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc')
    )
  );

-- SELECT: admin vê o status de todo mundo; a escola só a própria linha.
drop policy if exists "admin_alert_recipients_select" on public.admin_alert_recipients;
create policy "admin_alert_recipients_select" on public.admin_alert_recipients
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('regional_admin', 'chefe_departamento', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc')
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.school_id = admin_alert_recipients.school_id
    )
  );

-- UPDATE: só a própria escola (school_manager) marca a própria ciência.
drop policy if exists "admin_alert_recipients_update_own_school" on public.admin_alert_recipients;
create policy "admin_alert_recipients_update_own_school" on public.admin_alert_recipients
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'school_manager'
        and p.school_id = admin_alert_recipients.school_id
    )
  );

-- Mesma proteção de escrita das demais tabelas (ver migration
-- 20260713010000_add_read_only_role_write_block.sql): chefe_departamento
-- não escreve em lugar nenhum, nem aqui.
drop trigger if exists trg_block_write_readonly on public.admin_alerts;
create trigger trg_block_write_readonly before insert or update or delete on public.admin_alerts
  for each row execute function public.block_write_for_readonly_roles();

drop trigger if exists trg_block_write_readonly on public.admin_alert_recipients;
create trigger trg_block_write_readonly before insert or update or delete on public.admin_alert_recipients
  for each row execute function public.block_write_for_readonly_roles();
