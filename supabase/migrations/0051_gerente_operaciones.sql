-- ============================================================
-- MÓDULO: GERENTE DE OPERACIONES (Alertas y Backlog de Optimizaciones)
-- ============================================================

-- 1. Tabla de Alertas de Operaciones
create table if not exists public.alertas_operaciones (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null,
  titulo          text not null,
  descripcion     text not null,
  prioridad       text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'critica')),
  estatus         text not null default 'pendiente' check (estatus in ('pendiente', 'en_revision', 'resuelta', 'descartada')),
  entidad_tipo    text,
  entidad_id      text,
  metadatos       jsonb not null default '{}'::jsonb,
  sugerencia_ia   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices para optimizar consultas de alertas
create index if not exists alertas_operaciones_estatus_idx
  on public.alertas_operaciones (estatus, prioridad, created_at desc);

create index if not exists alertas_operaciones_entidad_idx
  on public.alertas_operaciones (entidad_tipo, entidad_id);

-- 2. Tabla de Backlog de Optimizaciones
create table if not exists public.optimizaciones_backlog (
  id                    uuid primary key default gen_random_uuid(),
  titulo                text not null,
  descripcion           text not null,
  categoria             text not null default 'codigo' check (categoria in ('codigo', 'automatizacion', 'proceso', 'base_datos')),
  codigo_propuesto      text not null,
  archivo_destino       text not null,
  parche_diff           text,
  prioridad             text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'critica')),
  estatus               text not null default 'propuesto' check (estatus in ('propuesto', 'aprobado', 'rechazado', 'aplicado', 'fallido')),
  resultado_aplicacion  text,
  creado_por            text not null default 'agente_gerente',
  aprobado_por          uuid references public.perfiles(id) on delete set null,
  fecha_aprobacion      timestamptz,
  fecha_aplicacion      timestamptz,
  metadatos             jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Índices para optimizar consultas de optimizaciones
create index if not exists optimizaciones_backlog_estatus_idx
  on public.optimizaciones_backlog (estatus, prioridad, created_at desc);

-- Función y Triggers para actualización automática de updated_at
create or replace function public.handle_updated_at_gerente()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_alertas_operaciones_updated_at on public.alertas_operaciones;
create trigger tr_alertas_operaciones_updated_at
  before update on public.alertas_operaciones
  for each row execute function public.handle_updated_at_gerente();

drop trigger if exists tr_optimizaciones_backlog_updated_at on public.optimizaciones_backlog;
create trigger tr_optimizaciones_backlog_updated_at
  before update on public.optimizaciones_backlog
  for each row execute function public.handle_updated_at_gerente();

-- Habilitar Row Level Security (RLS)
alter table public.alertas_operaciones enable row level security;
alter table public.optimizaciones_backlog enable row level security;

-- Políticas de Seguridad RLS: Solo administradores autenticados pueden acceder y modificar
drop policy if exists "Administradores pueden gestionar alertas_operaciones" on public.alertas_operaciones;
create policy "Administradores pueden gestionar alertas_operaciones"
  on public.alertas_operaciones for all
  to authenticated
  using (
    exists (
      select 1 from public.perfiles
      where perfiles.id = auth.uid()
      and perfiles.rol = 'admin'
      and perfiles.activo = true
    )
  );

drop policy if exists "Administradores pueden gestionar optimizaciones_backlog" on public.optimizaciones_backlog;
create policy "Administradores pueden gestionar optimizaciones_backlog"
  on public.optimizaciones_backlog for all
  to authenticated
  using (
    exists (
      select 1 from public.perfiles
      where perfiles.id = auth.uid()
      and perfiles.rol = 'admin'
      and perfiles.activo = true
    )
  );
