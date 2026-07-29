-- Migration 0060: Agregar entidad_target por etapa en etapas_configuracion
-- ====================================================================

ALTER TABLE public.etapas_configuracion
ADD COLUMN IF NOT EXISTS entidad_target TEXT NOT NULL DEFAULT 'expediente'
CHECK (entidad_target IN ('expediente', 'prospecto'));
