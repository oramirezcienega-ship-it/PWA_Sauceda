-- ============================================================
-- MIGRACIÓN 0033: Métricas Orgánicas de Redes Sociales
-- ============================================================

create table if not exists public.metricas_organicas (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  plataforma      text not null check (plataforma in ('facebook', 'instagram', 'tiktok')),
  seguidores      integer not null default 0 check (seguidores >= 0),
  publicaciones   integer not null default 0 check (publicaciones >= 0),
  visualizaciones integer not null default 0 check (visualizaciones >= 0),
  interacciones   integer not null default 0 check (interacciones >= 0),
  created_at      timestamptz not null default now(),
  constraint metricas_organicas_fecha_plataforma_key unique (fecha, plataforma)
);

-- Índices para agilizar consultas
create index if not exists metricas_organicas_fecha_idx on public.metricas_organicas(fecha);

-- Habilitar RLS (seguridad de filas)
alter table public.metricas_organicas enable row level security;
