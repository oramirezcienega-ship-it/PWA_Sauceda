-- ==============================================================================
-- MIGRACIÓN 0110: Agregar columna prompt_imagen_flux a publicaciones_programadas
-- Compatible con: Supabase Producción y Staging
-- Permite almacenar y consultar el prompt fotorrealista para IA (Flux)
-- ==============================================================================

alter table public.publicaciones_programadas 
  add column if not exists prompt_imagen_flux text;

-- Recargar caché de PostgREST
notify pgrst, 'reload schema';
