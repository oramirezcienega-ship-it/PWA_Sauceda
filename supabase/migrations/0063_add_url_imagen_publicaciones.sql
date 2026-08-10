-- ============================================================
-- MIGRACIÓN 0063: Agregar columna url_imagen a publicaciones_programadas
-- ============================================================

alter table public.publicaciones_programadas 
add column if not exists url_imagen text;
