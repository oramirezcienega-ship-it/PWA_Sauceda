-- Migration 0048: Permitir tipo de cita 'llamada' en agenda_citas
-- ==============================================================================================

-- 1. Eliminar la restricción de check de tipo_cita actual en agenda_citas
ALTER TABLE public.agenda_citas
  DROP CONSTRAINT IF EXISTS agenda_citas_tipo_cita_check;

-- 2. Agregar la nueva restricción que incluye 'instalacion' y 'llamada'
ALTER TABLE public.agenda_citas
  ADD CONSTRAINT agenda_citas_tipo_cita_check
  CHECK (tipo_cita IN ('venta', 'asesoria', 'inspeccion', 'instalacion', 'llamada'));
