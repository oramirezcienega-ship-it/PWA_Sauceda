-- ============================================================
-- MIGRACIÓN 0062: Publicaciones Programadas (Marketing Agent)
-- ============================================================

create table if not exists public.publicaciones_programadas (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  contenido           text not null,
  plataforma          text not null check (plataforma in ('facebook', 'instagram', 'tiktok', 'whatsapp')),
  tipo_formato        text not null check (tipo_formato in ('imagen', 'carrusel', 'video', 'reel')),
  sugerencia_visual   text,
  guion_video         text,
  fecha_programacion  timestamptz not null,
  estado              text not null default 'pendiente_revision' 
                        check (estado in ('pendiente_revision', 'aprobado', 'rechazado', 'publicado')),
  notas_revision      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Índices de consulta rápida
create index if not exists publicaciones_programadas_estado_idx on public.publicaciones_programadas(estado);
create index if not exists publicaciones_programadas_fecha_idx on public.publicaciones_programadas(fecha_programacion);

-- Habilitar RLS (seguridad de filas)
alter table public.publicaciones_programadas enable row level security;

-- Política de acceso para usuarios autenticados
create policy "Acceso total para usuarios autenticados"
  on public.publicaciones_programadas
  for all
  to authenticated
  using (true)
  with check (true);
