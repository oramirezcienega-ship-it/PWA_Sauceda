-- Migration 0039: Permitir tipo de cita 'inspeccion' en agenda_citas
-- ============================================================

-- 1. Eliminar la restricción de check actual
ALTER TABLE public.agenda_citas
  DROP CONSTRAINT IF EXISTS agenda_citas_tipo_cita_check;

-- 2. Agregar la nueva restricción que incluye 'inspeccion'
ALTER TABLE public.agenda_citas
  ADD CONSTRAINT agenda_citas_tipo_cita_check
  CHECK (tipo_cita IN ('venta', 'asesoria', 'inspeccion'));
