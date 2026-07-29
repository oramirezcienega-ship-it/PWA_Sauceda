-- =========================================================================
-- MIGRACIÓN: 0056_sync_calificacion_expedientes_prospectos.sql
-- -------------------------------------------------------------------------
-- Agrega columna calificacion a expedientes y establece sincronización
-- bidireccional automática entre prospectos y expedientes.
-- =========================================================================

-- 1. Agregar columna calificacion a expedientes con restricción CHECK
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS calificacion TEXT NOT NULL DEFAULT 'frio'
  CONSTRAINT check_expedientes_calificacion CHECK (calificacion IN ('caliente', 'templado', 'frio', 'descalificado'));

-- 2. Backfill inicial: copiar calificación de los prospectos a sus expedientes
UPDATE public.expedientes e
SET calificacion = p.calificacion
FROM public.prospectos p
WHERE e.prospecto_id = p.id
  AND p.calificacion IS NOT NULL
  AND e.calificacion IS DISTINCT FROM p.calificacion;

-- 3. Trigger: al cambiar o asignar la calificación de un expediente -> actualizar prospecto
CREATE OR REPLACE FUNCTION public.fn_sync_calificacion_expediente_to_prospecto()
RETURNS trigger AS $$
BEGIN
  IF NEW.prospecto_id IS NOT NULL AND NEW.calificacion IS NOT NULL THEN
    UPDATE public.prospectos
    SET calificacion = NEW.calificacion
    WHERE id = NEW.prospecto_id
      AND calificacion IS DISTINCT FROM NEW.calificacion;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_calificacion_expediente_to_prospecto ON public.expedientes;
CREATE TRIGGER trg_sync_calificacion_expediente_to_prospecto
  AFTER INSERT OR UPDATE OF calificacion, prospecto_id
  ON public.expedientes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_calificacion_expediente_to_prospecto();

-- 4. Trigger: al cambiar la calificación de un prospecto -> actualizar sus expedientes
CREATE OR REPLACE FUNCTION public.fn_sync_calificacion_prospecto_to_expediente()
RETURNS trigger AS $$
BEGIN
  IF NEW.calificacion IS NOT NULL THEN
    UPDATE public.expedientes
    SET calificacion = NEW.calificacion
    WHERE prospecto_id = NEW.id
      AND calificacion IS DISTINCT FROM NEW.calificacion;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_calificacion_prospecto_to_expediente ON public.prospectos;
CREATE TRIGGER trg_sync_calificacion_prospecto_to_expediente
  AFTER UPDATE OF calificacion
  ON public.prospectos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_calificacion_prospecto_to_expediente();
