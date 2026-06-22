-- Migración 0021: Agregar canal_id a prospectos y expedientes
-- Permite separar el ID técnico de redes sociales del teléfono real

ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS canal_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS canal_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.sequence_enrollments ADD COLUMN IF NOT EXISTS canal_id TEXT NOT NULL DEFAULT '';

-- Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS prospectos_canal_id_idx ON public.prospectos(canal_id);
CREATE INDEX IF NOT EXISTS expedientes_canal_id_idx ON public.expedientes(canal_id);
CREATE INDEX IF NOT EXISTS sequence_enrollments_canal_id_idx ON public.sequence_enrollments(canal_id);
