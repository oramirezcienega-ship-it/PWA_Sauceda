-- Migration 0045: Permitir tipo de cita 'instalacion' en agenda_citas y fecha_instalacion en expedientes
-- ==============================================================================================

-- 1. Eliminar la restricción de check de tipo_cita actual en agenda_citas
ALTER TABLE public.agenda_citas
  DROP CONSTRAINT IF EXISTS agenda_citas_tipo_cita_check;

-- 2. Agregar la nueva restricción que incluye 'instalacion'
ALTER TABLE public.agenda_citas
  ADD CONSTRAINT agenda_citas_tipo_cita_check
  CHECK (tipo_cita IN ('venta', 'asesoria', 'inspeccion', 'instalacion'));

-- 3. Añadir expediente_id y fraccionamiento a agenda_citas si no existen
ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS expediente_id TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fraccionamiento TEXT;

-- 4. Añadir fecha_instalacion a la tabla expedientes si no existe
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS fecha_instalacion TIMESTAMPTZ;

-- 5. Crear índice por expediente_id en agenda_citas
CREATE INDEX IF NOT EXISTS agenda_citas_expediente_idx ON public.agenda_citas(expediente_id);
