-- ============================================================
-- MÓDULO: NOTIFICACIONES (Alertas operativas para asesores)
-- ------------------------------------------------------------
-- Se agrega el campo telefono a perfiles para notificar vía WhatsApp.
-- Se crea la tabla de notificaciones para control in-app.
-- ============================================================

-- 1. Agregar columna de teléfono a la tabla de perfiles si no existe
alter table public.perfiles
  add column if not exists telefono text not null default '';

-- 2. Crear la tabla de notificaciones operativas
create table if not exists public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfiles(id) on delete cascade,
  titulo     text not null,
  cuerpo     text not null,
  leido      boolean not null default false,
  enlace     text,
  created_at timestamptz not null default now()
);

-- 3. Habilitar seguridad de nivel de fila (RLS)
alter table public.notificaciones enable row level security;

-- 4. Crear políticas para que los usuarios gestionen sus propias notificaciones
create policy "Usuarios pueden ver sus propias notificaciones"
  on public.notificaciones for select
  using (perfil_id = auth.uid());

create policy "Usuarios pueden actualizar sus propias notificaciones"
  on public.notificaciones for update
  using (perfil_id = auth.uid());
