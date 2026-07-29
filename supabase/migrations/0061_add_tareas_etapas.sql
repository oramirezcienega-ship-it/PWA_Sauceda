-- Migration 0061: Agregar tareas_operativas_json a etapas_configuracion
-- =====================================================================

ALTER TABLE public.etapas_configuracion
ADD COLUMN IF NOT EXISTS tareas_operativas_json JSONB DEFAULT '[]'::jsonb;
