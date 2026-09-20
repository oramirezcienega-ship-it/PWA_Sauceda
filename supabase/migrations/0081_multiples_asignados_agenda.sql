-- Migration 0081: Soporte para asignación múltiple de personas en agenda_citas
-- ===========================================================================

-- 1. Agregar columna de arreglo de UUIDs para perfiles asignados
ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS asignados_ids UUID[] DEFAULT '{}';

-- 2. Índice GIN para búsquedas eficientes de citas por cualquiera de los asignados
CREATE INDEX IF NOT EXISTS agenda_citas_asignados_ids_gin ON public.agenda_citas USING GIN(asignados_ids);

-- 3. Backfill inicial: llenar asignados_ids con el perfil_id existente donde esté vacío
UPDATE public.agenda_citas
  SET asignados_ids = ARRAY[perfil_id]
  WHERE (asignados_ids IS NULL OR cardinality(asignados_ids) = 0)
    AND perfil_id IS NOT NULL;
