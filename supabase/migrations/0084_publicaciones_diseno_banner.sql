-- ============================================================
-- MIGRACIÓN 0084: Agregar columna diseno_banner a publicaciones_programadas
-- ============================================================

alter table public.publicaciones_programadas 
add column if not exists diseno_banner jsonb default '{}'::jsonb;
