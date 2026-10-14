-- Contatos da escola: pessoas que já se identificaram ao acionar os serviços
-- emergenciais (Caminhão Pipa / Falta de Energia). Cada solicitação grava o
-- contato aqui; se ele já existir (mesmo nome + mesmo telefone na mesma
-- escola) apenas atualiza cargo e último uso, sem duplicar.

create table if not exists public.school_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  cargo text not null default '',
  -- Só dígitos, com DDD (10 ou 11 dígitos).
  telefone text not null check (telefone ~ '^[0-9]{10,11}$'),
  -- Nome sem acento, minúsculo e com espaços colapsados: chave de deduplicação.
  nome_chave text generated always as (
    lower(regexp_replace(trim(public.imm_unaccent(nome)), '\s+', ' ', 'g'))
  ) stored,
  origem text not null default 'MANUAL' check (origem in ('WATER_TRUCK', 'POWER_OUTAGE', 'MANUAL')),
  usos integer not null default 1,
  ultimo_uso timestamptz not null default now()
);

create unique index if not exists school_contacts_dedup_key
  on public.school_contacts (school_id, telefone, nome_chave);
create index if not exists school_contacts_school_idx on public.school_contacts (school_id);

comment on table public.school_contacts is 'Contatos da escola informados ao solicitar Caminhão Pipa / notificar Falta de Energia.';

-- Grava (ou reaproveita) o contato. security definer para que o gestor da
-- escola consiga registrar sem precisar de policy de insert/update aberta.
create or replace function public.registrar_contato_escola(
  p_school_id uuid,
  p_nome text,
  p_cargo text,
  p_telefone text,
  p_origem text default 'MANUAL'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_user_school uuid;
  v_telefone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cargo text := regexp_replace(trim(coalesce(p_cargo, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  select p.role::text, p.school_id into v_role, v_user_school
    from public.profiles p where p.id = auth.uid();

  if v_role is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if v_role = 'school_manager' and v_user_school is distinct from p_school_id then
    raise exception 'Escola não vinculada ao usuário.' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'Informe o nome do contato.';
  end if;
  if v_telefone !~ '^[0-9]{10,11}$' then
    raise exception 'Telefone inválido: informe DDD + número.';
  end if;

  insert into public.school_contacts (school_id, nome, cargo, telefone, origem)
  values (p_school_id, v_nome, v_cargo, v_telefone, coalesce(p_origem, 'MANUAL'))
  on conflict (school_id, telefone, nome_chave) do update
    set cargo = case when excluded.cargo <> '' then excluded.cargo else school_contacts.cargo end,
        usos = school_contacts.usos + 1,
        ultimo_uso = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registrar_contato_escola(uuid, text, text, text, text) from public;
grant execute on function public.registrar_contato_escola(uuid, text, text, text, text) to authenticated;

-- RLS: gestor da escola vê/edita só os da própria escola; demais papéis da
-- rede veem todos e a administração regional pode editar/excluir.
alter table public.school_contacts enable row level security;

drop policy if exists "school_contacts: leitura" on public.school_contacts;
create policy "school_contacts: leitura" on public.school_contacts
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role::text <> 'school_manager' or p.school_id = school_contacts.school_id)
  ));

drop policy if exists "school_contacts: escrita" on public.school_contacts;
create policy "school_contacts: escrita" on public.school_contacts
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role::text in ('regional_admin', 'manage_admin', 'admin')
           or (p.role::text = 'school_manager' and p.school_id = school_contacts.school_id))
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role::text in ('regional_admin', 'manage_admin', 'admin')
           or (p.role::text = 'school_manager' and p.school_id = school_contacts.school_id))
  ));

drop trigger if exists trg_block_write_readonly on public.school_contacts;
create trigger trg_block_write_readonly before insert or delete or update
  on public.school_contacts for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.school_contacts to authenticated;
grant all on table public.school_contacts to service_role;
