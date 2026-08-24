-- Migration 0071: Sincronización automática de Etapas entre Prospecto y Expediente
-- Garantiza que al cambiar la etapa de un prospecto o expediente, se actualicen mutuamente en la BD.

-- 1. Función para sincronizar Expedientes al actualizar un Prospecto
CREATE OR REPLACE FUNCTION public.fn_sync_expediente_desde_prospecto()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.estatus IS DISTINCT FROM NEW.estatus) THEN
    -- Si el prospecto pasa a Lead, MQL o Nuevo -> Expedientes pasan a 'nuevo-lead'
    IF NEW.estatus IN ('lead', 'mql', 'nuevo') THEN
      UPDATE public.expedientes
      SET etapa = 'nuevo-lead', ultimo_movimiento = CURRENT_DATE::text
      WHERE prospecto_id = NEW.id AND etapa IS DISTINCT FROM 'nuevo-lead';

    -- Si el prospecto pasa a Cliente -> Expedientes pasan a 'cerrado'
    ELSIF NEW.estatus = 'cliente' THEN
      UPDATE public.expedientes
      SET etapa = 'cerrado', ultimo_movimiento = CURRENT_DATE::text
      WHERE prospecto_id = NEW.id AND etapa IS DISTINCT FROM 'cerrado';

    -- Si el prospecto pasa a No Viable -> Expedientes pasan a 'perdido'
    ELSIF NEW.estatus = 'no_viable' THEN
      UPDATE public.expedientes
      SET etapa = 'perdido', asesor_id = NULL, ultimo_movimiento = CURRENT_DATE::text
      WHERE prospecto_id = NEW.id AND etapa IS DISTINCT FROM 'perdido';

    -- Si el prospecto pasa a SQL -> Si sus expedientes estaban en cerrado/perdido, reactivar a 'nuevo-lead'
    ELSIF NEW.estatus IN ('sql', 'expediente_abierto') THEN
      UPDATE public.expedientes
      SET etapa = 'nuevo-lead', ultimo_movimiento = CURRENT_DATE::text
      WHERE prospecto_id = NEW.id AND etapa IN ('cerrado', 'perdido');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_expediente_desde_prospecto ON public.prospectos;
CREATE TRIGGER trg_sync_expediente_desde_prospecto
  AFTER UPDATE OF estatus ON public.prospectos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_expediente_desde_prospecto();


-- 2. Función para sincronizar Prospecto al actualizar un Expediente
CREATE OR REPLACE FUNCTION public.fn_sync_prospecto_desde_expediente()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.prospecto_id IS NOT NULL) AND (OLD.etapa IS DISTINCT FROM NEW.etapa) THEN
    -- Si el expediente pasa a Cerrado -> Prospecto pasa a 'cliente' con calificación caliente
    IF NEW.etapa = 'cerrado' THEN
      UPDATE public.prospectos
      SET estatus = 'cliente', calificacion = 'caliente'
      WHERE id = NEW.prospecto_id AND estatus IS DISTINCT FROM 'cliente';

    -- Si el expediente pasa a Perdido -> Si todos sus expedientes son perdidos, prospecto pasa a 'no_viable'
    ELSIF NEW.etapa = 'perdido' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.expedientes 
        WHERE prospecto_id = NEW.prospecto_id AND etapa <> 'perdido'
      ) THEN
        UPDATE public.prospectos
        SET estatus = 'no_viable', calificacion = 'descalificado'
        WHERE id = NEW.prospecto_id AND estatus IS DISTINCT FROM 'no_viable';
      END IF;

    -- Si el expediente pasa a Contacto inicial u Oferta -> Prospecto pasa a 'sql'
    ELSIF NEW.etapa IN ('contactado', 'oferta', 'valuacion', 'documentos', 'notaria', 'nuevo-lead') THEN
      UPDATE public.prospectos
      SET estatus = 'sql', calificacion = COALESCE(calificacion, 'templado')
      WHERE id = NEW.prospecto_id AND estatus IN ('cliente', 'no_viable');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_prospecto_desde_expediente ON public.expedientes;
CREATE TRIGGER trg_sync_prospecto_desde_expediente
  AFTER UPDATE OF etapa ON public.expedientes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_prospecto_desde_expediente();
