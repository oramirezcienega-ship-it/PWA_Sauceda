-- ============================================================
-- MIGRACIÓN 0087: Enlaces y Seguimiento de Publicación en Meta (Facebook & Instagram)
-- ============================================================

ALTER TABLE public.publicaciones_programadas 
ADD COLUMN IF NOT EXISTS url_publicacion text,
ADD COLUMN IF NOT EXISTS meta_post_id text,
ADD COLUMN IF NOT EXISTS publicado_en timestamptz,
ADD COLUMN IF NOT EXISTS error_publicacion text;

-- Índice para acelerar la búsqueda de publicaciones por su identificador externo en Meta
CREATE INDEX IF NOT EXISTS publicaciones_programadas_meta_post_id_idx 
ON public.publicaciones_programadas(meta_post_id) 
WHERE meta_post_id IS NOT NULL;
