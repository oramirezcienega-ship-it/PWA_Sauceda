-- ============================================================
-- MÓDULO: AUTOMATIZACIONES (motor de reglas por disparadores)
-- ------------------------------------------------------------
-- Cada regla define UN evento disparador (nuevo expediente, nuevo
-- prospecto, cambio de etapa, formulario respondido, cambio de campo),
-- condiciones opcionales (campo/operador/valor, se evalúan con AND) y
-- una o varias acciones (enviar formulario, enviar correo, enviar
-- WhatsApp, mover de etapa).
--
-- La tabla _log guarda cada ejecución para poder auditar qué hizo el
-- motor y diagnosticar fallos.
-- ============================================================

create table if not exists public.automatizaciones (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  activa       boolean not null default true,
  evento       text not null,
  condiciones  jsonb not null default '[]'::jsonb,
  acciones     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.automatizaciones enable row level security;

create index if not exists automatizaciones_evento_idx
  on public.automatizaciones (evento);

create table if not exists public.automatizaciones_log (
  id                uuid primary key default gen_random_uuid(),
  automatizacion_id uuid references public.automatizaciones(id) on delete set null,
  nombre            text not null default '',
  evento            text not null,
  expediente_id     text references public.expedientes(id) on delete set null,
  prospecto_id      text references public.prospectos(id) on delete set null,
  estado            text not null default 'ok', -- 'ok' | 'error' | 'omitido'
  detalle           text not null default '',
  created_at        timestamptz not null default now()
);
alter table public.automatizaciones_log enable row level security;

create index if not exists automatizaciones_log_aut_idx
  on public.automatizaciones_log (automatizacion_id);
create index if not exists automatizaciones_log_created_idx
  on public.automatizaciones_log (created_at desc);
