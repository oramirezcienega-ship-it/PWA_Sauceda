-- Migration 0069: Parametrizar asignación automática de nuevos leads en perfiles

-- 1. Agregar columna asignacion_automatica a public.perfiles si no existe
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS asignacion_automatica BOOLEAN DEFAULT FALSE;

-- 2. Establecer por defecto a Gerardo (o al primer perfil activo si Gerardo no existe)
DO $$
BEGIN
  -- Intentar asignar a Gerardo
  UPDATE public.perfiles
  SET asignacion_automatica = TRUE
  WHERE nombre ILIKE '%gerardo%';

  -- Si ningún perfil quedó con asignación automática, asignar al primer asesor/admin activo
  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE asignacion_automatica IS TRUE) THEN
    UPDATE public.perfiles
    SET asignacion_automatica = TRUE
    WHERE id = (
      SELECT id FROM public.perfiles
      WHERE (activo IS TRUE OR activo IS NULL)
      ORDER BY CASE WHEN rol = 'asesor' THEN 1 WHEN rol = 'admin' THEN 2 ELSE 3 END
      LIMIT 1
    );
  END IF;
END $$;

-- 3. Actualizar la función desencadenadora para auto-asignación de prospectos y expedientes
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_asesor_gerardo()
RETURNS trigger AS $$
DECLARE
  v_asesor_id uuid;
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

  -- 1. Buscar id del perfil configurado para asignación automática
  SELECT id INTO v_asesor_id
  FROM public.perfiles
  WHERE asignacion_automatica IS TRUE AND (activo IS TRUE OR activo IS NULL)
  LIMIT 1;

  -- 2. Fallback: Buscar id del perfil de Gerardo
  IF v_asesor_id IS NULL THEN
    SELECT id INTO v_asesor_id
    FROM public.perfiles
    WHERE nombre ILIKE '%gerardo%' AND (activo IS TRUE OR activo IS NULL)
    LIMIT 1;
  END IF;

  -- 3. Fallback: Buscar el primer perfil activo con rol 'asesor'
  IF v_asesor_id IS NULL THEN
    SELECT id INTO v_asesor_id
    FROM public.perfiles
    WHERE rol = 'asesor' AND (activo IS TRUE OR activo IS NULL)
    LIMIT 1;
  END IF;

  -- Asignar el id encontrado si existe
  IF v_asesor_id IS NOT NULL THEN
    NEW.asesor_id := v_asesor_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
