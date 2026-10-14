-- Gestão de Supervisores: ficha de cada supervisor (contatos, escolas sob
-- sua responsabilidade e veículos com o estacionamento onde ficam).
--
-- Os supervisores continuam sendo linhas de `profiles` com role 'supervisor'
-- (eles têm login) e as escolas continuam em `profiles.supervisor_schools`,
-- que já é lido por várias páginas para filtrar a rede. O que muda é que
-- agora o banco garante a regra "cada escola tem um único supervisor".

-- 1) Contatos do supervisor. O e-mail de login (`profiles.email`) não muda
--    aqui porque é o mesmo do auth; o de contato é independente.
alter table public.profiles add column if not exists whatsapp text;
alter table public.profiles add column if not exists email_contato text;

comment on column public.profiles.whatsapp is 'WhatsApp do usuário (só dígitos, com DDD). Usado na ficha de supervisores.';
comment on column public.profiles.email_contato is 'E-mail de contato (pode diferir do e-mail de login). Usado na ficha de supervisores.';

-- 2) Uma escola, um supervisor. Ao vincular escolas a um perfil, elas saem
--    de qualquer outro perfil que as tivesse — ou seja, vincular equivale a
--    transferir. Vale para a nova página e para a Gestão de Usuários, que
--    também grava `supervisor_schools`.
create or replace function public.supervisor_schools_exclusivas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- As remoções abaixo disparam esta mesma trigger nos outros perfis; elas só
  -- tiram escolas, então não há nada a propagar.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.supervisor_schools is not null and cardinality(new.supervisor_schools) > 0 then
    update public.profiles p
       set supervisor_schools = array(
             select s from unnest(p.supervisor_schools) s
              where s <> all (new.supervisor_schools)
           )
     where p.id <> new.id
       and p.supervisor_schools && new.supervisor_schools;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_supervisor_schools_exclusivas on public.profiles;
create trigger trg_supervisor_schools_exclusivas
  after insert or update of supervisor_schools on public.profiles
  for each row execute function public.supervisor_schools_exclusivas();

-- Escolas que hoje já estão com mais de um supervisor não são resolvidas
-- automaticamente (não há como saber qual vínculo é o certo); a página
-- de supervisores as destaca para o regional_admin decidir.
do $$
declare
  r record;
begin
  for r in
    select s.name, string_agg(coalesce(p.full_name, p.id::text), ', ') as supervisores
      from public.profiles p
      cross join lateral unnest(p.supervisor_schools) as v(school_id)
      join public.schools s on s.id = v.school_id
     group by s.id, s.name
    having count(*) > 1
  loop
    raise notice 'Escola "%" está com mais de um supervisor: %', r.name, r.supervisores;
  end loop;
end $$;

-- 3) Estacionamentos onde os veículos ficam alocados. Cadastro simples,
--    mantido pelo regional_admin na própria página.
create table if not exists public.estacionamentos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null,
  endereco text
);

create unique index if not exists estacionamentos_nome_key on public.estacionamentos (lower(nome));

comment on table public.estacionamentos is 'Estacionamentos onde ficam alocados os veículos dos supervisores.';

-- 4) Veículos do supervisor (um supervisor pode ter vários).
create table if not exists public.supervisor_veiculos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null default 'carro' check (tipo in ('carro', 'moto')),
  placa text not null,
  modelo text not null default '',
  cor text not null default '',
  -- restrict: não deixa apagar um estacionamento com veículo alocado nele.
  estacionamento_id uuid not null references public.estacionamentos(id) on delete restrict,
  vaga text
);

create unique index if not exists supervisor_veiculos_placa_key on public.supervisor_veiculos (upper(placa));
create index if not exists supervisor_veiculos_supervisor_idx on public.supervisor_veiculos (supervisor_id);
create index if not exists supervisor_veiculos_estacionamento_idx on public.supervisor_veiculos (estacionamento_id);

comment on table public.supervisor_veiculos is 'Veículos dos supervisores e o estacionamento em que cada um está alocado.';

-- 5) RLS: leitura para a rede, escrita só para a administração regional.
alter table public.estacionamentos enable row level security;
alter table public.supervisor_veiculos enable row level security;

drop policy if exists "estacionamentos: leitura" on public.estacionamentos;
create policy "estacionamentos: leitura" on public.estacionamentos
  for select to authenticated using (true);

drop policy if exists "estacionamentos: escrita admin" on public.estacionamentos;
create policy "estacionamentos: escrita admin" on public.estacionamentos
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ));

drop policy if exists "supervisor_veiculos: leitura" on public.supervisor_veiculos;
create policy "supervisor_veiculos: leitura" on public.supervisor_veiculos
  for select to authenticated using (true);

drop policy if exists "supervisor_veiculos: escrita admin" on public.supervisor_veiculos;
create policy "supervisor_veiculos: escrita admin" on public.supervisor_veiculos
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('regional_admin', 'manage_admin', 'admin')
  ));

-- Mesmo padrão de bloqueio do papel somente-leitura (chefe_departamento).
drop trigger if exists trg_block_write_readonly on public.estacionamentos;
create trigger trg_block_write_readonly before insert or delete or update
  on public.estacionamentos for each row
  execute function public.block_write_for_readonly_roles();

drop trigger if exists trg_block_write_readonly on public.supervisor_veiculos;
create trigger trg_block_write_readonly before insert or delete or update
  on public.supervisor_veiculos for each row
  execute function public.block_write_for_readonly_roles();

grant all on table public.estacionamentos to authenticated;
grant all on table public.estacionamentos to service_role;
grant all on table public.supervisor_veiculos to authenticated;
grant all on table public.supervisor_veiculos to service_role;
