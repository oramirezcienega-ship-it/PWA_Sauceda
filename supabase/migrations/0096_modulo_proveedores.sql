-- ============================================================
-- MIGRACIÓN 0086: MÓDULO DE PROVEEDORES
-- ------------------------------------------------------------
-- Registra proveedores externos (contratistas, materiales, etc.) y las
-- facturas/remisiones que ellos entregan por trabajos relacionados a
-- órdenes de trabajo (cotizaciones) y/o expedientes. Estos costos se
-- muestran junto a la orden de trabajo para conocer el costo real pagado
-- a terceros. (Fase 1: solo captura de datos; no se modifican aún los
-- reportes/cálculos automáticos de utilidad en otros módulos.)
-- ============================================================

-- 1. Tabla de proveedores
create table if not exists public.proveedores (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  razon_social    text not null default '',
  rfc             text not null default '',
  categoria       text not null default '',
  contacto_nombre text not null default '',
  telefono        text not null default '',
  email           text not null default '',
  direccion       text not null default '',
  notas           text not null default '',
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.proveedores enable row level security;

drop policy if exists "Acceso completo a proveedores para usuarios autenticados" on public.proveedores;
create policy "Acceso completo a proveedores para usuarios autenticados"
  on public.proveedores for all
  to authenticated
  using (true)
  with check (true);

create index if not exists proveedores_nombre_idx on public.proveedores (nombre);
create index if not exists proveedores_categoria_idx on public.proveedores (categoria);

create or replace function public.actualizar_updated_at_proveedores()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_proveedores_updated_at on public.proveedores;
create trigger trigger_proveedores_updated_at
  before update on public.proveedores
  for each row
  execute function public.actualizar_updated_at_proveedores();

-- 2. Tabla de documentos de proveedores (facturas / remisiones que ellos entregan)
create table if not exists public.documentos_proveedores (
  id              uuid primary key default gen_random_uuid(),
  proveedor_id    uuid not null references public.proveedores(id) on delete cascade,
  cotizacion_id   text references public.cotizaciones(id) on delete set null,
  expediente_id   text references public.expedientes(id) on delete set null,
  tipo            text not null default 'remision' check (tipo in ('remision', 'factura')),
  folio           text not null default '',
  concepto        text not null default '',
  fecha           date not null default current_date,
  monto           numeric(12, 2) not null default 0.00,
  archivo_url     text,
  archivo_nombre  text,
  notas           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.documentos_proveedores enable row level security;

drop policy if exists "Acceso completo a documentos_proveedores para usuarios autenticados" on public.documentos_proveedores;
create policy "Acceso completo a documentos_proveedores para usuarios autenticados"
  on public.documentos_proveedores for all
  to authenticated
  using (true)
  with check (true);

create index if not exists documentos_proveedores_proveedor_idx on public.documentos_proveedores (proveedor_id);
create index if not exists documentos_proveedores_cotizacion_idx on public.documentos_proveedores (cotizacion_id);
create index if not exists documentos_proveedores_expediente_idx on public.documentos_proveedores (expediente_id);

create or replace function public.actualizar_updated_at_documentos_proveedores()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_documentos_proveedores_updated_at on public.documentos_proveedores;
create trigger trigger_documentos_proveedores_updated_at
  before update on public.documentos_proveedores
  for each row
  execute function public.actualizar_updated_at_documentos_proveedores();

-- 3. Bucket de Storage para adjuntar el PDF/imagen de la factura o remisión del proveedor
insert into storage.buckets (id, name, public)
values ('proveedores-documentos', 'proveedores-documentos', true)
on conflict (id) do update set public = excluded.public;
