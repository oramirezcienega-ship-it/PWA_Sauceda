-- ============================================================
-- MIGRACIÓN 0077: MÓDULO DE EMPRESAS (COMPANIES) Y RELACIONES B2B
-- ------------------------------------------------------------
-- Incorpora la entidad Empresas para consolidar cuentas corporativas.
-- Relaciona Empresas con Prospectos (contactos) y Expedientes (deals),
-- así como el registro de actividades / timeline directo a la cuenta.
-- ============================================================

-- 1. Crear tabla empresas
create table if not exists public.empresas (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  industry        text not null default '',
  website         text not null default '',
  phone           text not null default '',
  address         text not null default '',
  billing_address text not null default '',
  owner_id        uuid references public.perfiles(id) on delete set null,
  parent_id       uuid references public.empresas(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Habilitar RLS en empresas
alter table public.empresas enable row level security;

-- Política de acceso para usuarios autenticados del CRM
drop policy if exists "Acceso completo a empresas para usuarios autenticados" on public.empresas;
create policy "Acceso completo a empresas para usuarios autenticados"
  on public.empresas for all
  to authenticated
  using (true)
  with check (true);

-- 2. Índices de empresas
create index if not exists empresas_name_idx on public.empresas (name);
create index if not exists empresas_owner_idx on public.empresas (owner_id);
create index if not exists empresas_parent_idx on public.empresas (parent_id);
create index if not exists empresas_industry_idx on public.empresas (industry);

-- 3. Relación Empresa -> Prospectos (1 a Muchos)
alter table public.prospectos
  add column if not exists empresa_id uuid
    references public.empresas(id) on delete set null;

create index if not exists prospectos_empresa_idx
  on public.prospectos (empresa_id);

-- 4. Relación Empresa -> Expedientes / Negocios (1 a Muchos)
alter table public.expedientes
  add column if not exists empresa_id uuid
    references public.empresas(id) on delete set null;

create index if not exists expedientes_empresa_idx
  on public.expedientes (empresa_id);

-- 5. Relación Empresa -> Actividades (Timeline)
alter table public.actividades
  add column if not exists empresa_id uuid
    references public.empresas(id) on delete cascade;

create index if not exists actividades_empresa_idx
  on public.actividades (empresa_id);

-- 6. Trigger para actualizar el campo updated_at en empresas
create or replace function public.actualizar_updated_at_empresas()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_empresas_updated_at on public.empresas;
create trigger trigger_empresas_updated_at
  before update on public.empresas
  for each row
  execute function public.actualizar_updated_at_empresas();

-- 7. Relación Cotizaciones -> Empresas & Personalización de Destinatario / Compañía
alter table public.cotizaciones
  add column if not exists empresa_id uuid
    references public.empresas(id) on delete set null;

alter table public.cotizaciones
  add column if not exists cliente_nombre_personalizado text default null;

create index if not exists cotizaciones_empresa_idx
  on public.cotizaciones (empresa_id);

