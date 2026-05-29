-- ============================================================
-- MÓDULO: ACTIVIDADES (bitácora / timeline)
-- ------------------------------------------------------------
-- Registra eventos relacionados con un expediente y/o prospecto:
-- mensajes, formularios, llamadas, correos, notas, cambios de etapa, etc.
-- ============================================================

create table if not exists public.actividades (
  id            uuid primary key default gen_random_uuid(),
  expediente_id text references public.expedientes(id) on delete cascade,
  prospecto_id  text references public.prospectos(id) on delete cascade,
  tipo          text not null,
  titulo        text not null,
  detalle       text not null default '',
  created_at    timestamptz not null default now()
);
alter table public.actividades enable row level security;

create index if not exists actividades_expediente_idx
  on public.actividades (expediente_id);
create index if not exists actividades_prospecto_idx
  on public.actividades (prospecto_id);
