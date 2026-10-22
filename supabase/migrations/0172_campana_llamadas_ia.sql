-- ============================================================
-- MÓDULO: LLAMADAS IA (campañas salientes con Vapi)
-- ------------------------------------------------------------
-- Cola de llamadas que Sofía hace por Vapi + Twilio. Fase 1:
-- reagendar visitas técnicas de cotizaciones en 'esperando_visita'.
-- Nada se marca sin aprobación (estado 'aprobada') y los registros
-- de prueba llevan es_prueba = true.
-- ============================================================

create table if not exists public.llamadas_campana (
  id                uuid primary key default gen_random_uuid(),
  campana           text not null default 'reagendar_visita',
  telefono          text not null,
  nombre            text not null default '',
  prospecto_id      text references public.prospectos(id) on delete set null,
  cotizacion_id     text references public.cotizaciones(id) on delete set null,
  es_prueba         boolean not null default false,
  contexto          jsonb not null default '{}'::jsonb,   -- servicio, colonia, monto… para el guion
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente','aprobada','en_curso','completada','fallida','cancelada')),
  intentos          integer not null default 0,
  max_intentos      integer not null default 3,
  proximo_intento   timestamptz,
  vapi_call_id      text unique,
  resultado         text
                      check (resultado is null or resultado in (
                        'visita_agendada','transferido','duda','no_interesado',
                        'llamar_despues','no_contesta','buzon','no_llamar','error'
                      )),
  fecha_visita      timestamptz,                          -- la que acordó Sofía con el cliente
  resumen           text,
  transcripcion     text,
  grabacion_url     text,
  duracion_seg      integer,
  costo_usd         numeric(10,4),
  datos             jsonb,                                -- salida estructurada completa de Vapi
  error             text,
  creado_por        uuid references public.perfiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_llamadas_campana_estado
  on public.llamadas_campana (estado, proximo_intento);
create index if not exists idx_llamadas_campana_cotizacion
  on public.llamadas_campana (cotizacion_id) where cotizacion_id is not null;

alter table public.llamadas_campana enable row level security;

-- Teléfonos que pidieron no ser llamados (aplica a todas las campañas).
create table if not exists public.telefonos_no_llamar (
  telefono    text primary key,                         -- canónico (normalizarTelefono)
  motivo      text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.telefonos_no_llamar enable row level security;
