-- Migration 0059: Agregar columna entidad_target a procesos_maestros
-- ============================================================

ALTER TABLE public.procesos_maestros
ADD COLUMN IF NOT EXISTS entidad_target TEXT NOT NULL DEFAULT 'expediente' 
CHECK (entidad_target IN ('expediente', 'prospecto'));
