-- Migration 0065: Asignar automáticamente el asesor Gerardo cuando se crea un prospecto o expediente nuevo sin asesor asignado.

CREATE OR REPLACE FUNCTION public.fn_auto_asignar_asesor_gerardo()
RETURNS trigger AS $$
DECLARE
  v_gerardo_id uuid;
  v_prospecto_asesor_id uuid;
BEGIN
  -- Si ya se proporcionó un asesor_id explícito, respetarlo
  IF NEW.asesor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Si es la tabla expedientes y NEW.prospecto_id existe, intentar tomar el asesor_id del prospecto
  IF TG_TABLE_NAME = 'expedientes' AND NEW.prospecto_id IS NOT NULL THEN
    SELECT asesor_id INTO v_prospecto_asesor_id
    FROM public.prospectos
    WHERE id = NEW.prospecto_id;

    IF v_prospecto_asesor_id IS NOT NULL THEN
      NEW.asesor_id := v_prospecto_asesor_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Buscar id del perfil de Gerardo (búsqueda insensible a mayúsculas/minúsculas)
  SELECT id INTO v_gerardo_id
  FROM public.perfiles
  WHERE nombre ILIKE '%gerardo%'
  LIMIT 1;

  -- Si no existe un perfil con nombre Gerardo, buscar el primer perfil activo con rol 'asesor'
  IF v_gerardo_id IS NULL THEN
    SELECT id INTO v_gerardo_id
    FROM public.perfiles
    WHERE rol = 'asesor' AND (activo IS TRUE OR activo IS NULL)
    LIMIT 1;
  END IF;

  -- Asignar el id encontrado si existe
  IF v_gerardo_id IS NOT NULL THEN
    NEW.asesor_id := v_gerardo_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para prospectos
DROP TRIGGER IF EXISTS trg_auto_asignar_gerardo_prospecto ON public.prospectos;
CREATE TRIGGER trg_auto_asignar_gerardo_prospecto
BEFORE INSERT ON public.prospectos
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_asignar_asesor_gerardo();

-- Trigger para expedientes
DROP TRIGGER IF EXISTS trg_auto_asignar_gerardo_expediente ON public.expedientes;
CREATE TRIGGER trg_auto_asignar_gerardo_expediente
BEFORE INSERT ON public.expedientes
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_asignar_asesor_gerardo();

-- Activar notificaciones de WhatsApp de nuevo lead para Gerardo si la columna existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'perfiles' AND column_name = 'notificar_whatsapp_nuevo_lead'
  ) THEN
    UPDATE public.perfiles
    SET notificar_whatsapp_nuevo_lead = TRUE
    WHERE nombre ILIKE '%gerardo%';
  END IF;
END $$;
