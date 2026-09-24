-- ==============================================================================
-- MIGRACIÓN CONSOLIDADA: MÓDULO MARKETING & PUBLICACIONES IA
-- Compatible con: Supabase Producción y Staging
-- Ejecutar en: Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Crear tabla de publicaciones programadas si no existe
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

-- 2. Agregar columnas necesarias de forma segura si no existen
alter table public.publicaciones_programadas 
  add column if not exists url_imagen text,
  add column if not exists diseno_banner jsonb default '{}'::jsonb,
  add column if not exists inversion_ads numeric default 0,
  add column if not exists impresiones integer default 0,
  add column if not exists clics integer default 0,
  add column if not exists leads_generados integer default 0,
  add column if not exists cpl numeric default 0,
  add column if not exists roi_score numeric default 0,
  add column if not exists meta_ad_id text,
  add column if not exists url_publicacion text,
  add column if not exists meta_post_id text,
  add column if not exists publicado_en timestamptz,
  add column if not exists error_publicacion text;

-- 3. Crear índices para rendimiento
create index if not exists publicaciones_programadas_estado_idx on public.publicaciones_programadas(estado);
create index if not exists publicaciones_programadas_fecha_idx on public.publicaciones_programadas(fecha_programacion);
create index if not exists publicaciones_programadas_cpl_idx on public.publicaciones_programadas(cpl) where estado = 'publicado';
create index if not exists publicaciones_programadas_meta_post_id_idx on public.publicaciones_programadas(meta_post_id) where meta_post_id is not null;

-- 4. Habilitar seguridad a nivel de fila (RLS)
alter table public.publicaciones_programadas enable row level security;

-- 5. Crear políticas de acceso (idempotente)
drop policy if exists "Acceso total para usuarios autenticados" on public.publicaciones_programadas;
create policy "Acceso total para usuarios autenticados"
  on public.publicaciones_programadas
  for all
  to authenticated
  using (true)
  with check (true);

-- 6. Recargar caché de PostgREST
notify pgrst, 'reload schema';
