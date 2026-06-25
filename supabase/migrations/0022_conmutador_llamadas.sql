-- ============================================================
-- MÓDULO: CONMUTADOR TELEFÓNICO E IVR
-- ------------------------------------------------------------
-- Campos adicionales en perfiles y tabla de control de llamadas.
-- ============================================================

-- 1. Modificar la tabla perfiles para soporte de desvíos y horarios
alter table public.perfiles
  add column if not exists telefono_desvio text not null default '',
  add column if not exists disponible_llamadas boolean not null default false,
  add column if not exists horario_inicio time not null default '09:00:00',
  add column if not exists horario_fin time not null default '18:00:00';

-- 2. Crear tabla de llamadas del conmutador
create table if not exists public.llamadas_conmutador (
  id                uuid primary key default gen_random_uuid(),
  twilio_call_sid   text unique not null,
  cliente_telefono  text not null,
  prospecto_id      text references public.prospectos(id) on delete set null,
  agente_id         uuid references public.perfiles(id) on delete set null,
  tipo              text not null default 'entrante' check (tipo in ('entrante', 'saliente')),
  estado            text not null,
  duracion          integer, -- segundos
  grabacion_url     text,
  transcripcion     text,
  resumen_ia        text,
  datos_perfilados  jsonb,
  created_at        timestamptz not null default now()
);

-- 3. Habilitar RLS en la nueva tabla
alter table public.llamadas_conmutador enable row level security;

-- 4. Políticas de RLS para llamadas_conmutador
-- Permitir lectura a usuarios autenticados
create policy "Usuarios autenticados pueden ver llamadas"
  on public.llamadas_conmutador
  for select
  to authenticated
  using (true);

-- Permitir inserción y actualización a rol de servicio y usuarios autenticados (para APIs de webhooks y el CRM)
create policy "Permitir insertar llamadas"
  on public.llamadas_conmutador
  for insert
  to authenticated, service_role
  with check (true);

create policy "Permitir actualizar llamadas"
  on public.llamadas_conmutador
  for update
  to authenticated, service_role
  using (true)
  with check (true);
