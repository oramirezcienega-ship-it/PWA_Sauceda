-- =========================================================================
-- MIGRACIÓN: 0050_auto_link_prospectos_expedientes.sql
-- -------------------------------------------------------------------------
-- Asegura el enlace automático y bidireccional entre prospectos y expedientes
-- que compartan los mismos últimos 10 dígitos del número de teléfono.
-- =========================================================================

-- 1. Función auxiliar para normalizar y obtener los últimos 10 dígitos del teléfono
CREATE OR REPLACE FUNCTION public.clean_phone_10(phone text)
RETURNS text AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := regexp_replace(COALESCE(phone, ''), '\D', '', 'g');
  IF length(cleaned) >= 10 THEN
    RETURN right(cleaned, 10);
  ELSE
    RETURN cleaned;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Función de trigger al insertar/actualizar un expediente
CREATE OR REPLACE FUNCTION public.fn_auto_link_prospecto_on_expediente()
RETURNS trigger AS $$
DECLARE
  matching_prospecto_id text;
  tel_limpio text;
BEGIN
  -- Si ya viene con prospecto_id, no hacemos nada extra
  IF NEW.prospecto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  tel_limpio := public.clean_phone_10(NEW.telefono);

  IF tel_limpio <> '' THEN
    -- Buscar el prospecto más reciente que coincida con los últimos 10 dígitos
    SELECT id INTO matching_prospecto_id
    FROM public.prospectos
    WHERE public.clean_phone_10(telefono) = tel_limpio
    ORDER BY created_at DESC
    LIMIT 1;

    IF matching_prospecto_id IS NOT NULL THEN
      NEW.prospecto_id := matching_prospecto_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger en la tabla expedientes
DROP TRIGGER IF EXISTS trg_auto_link_prospecto_on_expediente ON public.expedientes;
CREATE TRIGGER trg_auto_link_prospecto_on_expediente
  BEFORE INSERT OR UPDATE OF telefono, prospecto_id
  ON public.expedientes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_link_prospecto_on_expediente();


-- 3. Función de trigger al insertar/actualizar un prospecto
CREATE OR REPLACE FUNCTION public.fn_auto_link_expedientes_on_prospecto()
RETURNS trigger AS $$
DECLARE
  tel_limpio text;
BEGIN
  tel_limpio := public.clean_phone_10(NEW.telefono);

  IF tel_limpio <> '' THEN
    -- Enlazar cualquier expediente huérfano con el mismo teléfono
    UPDATE public.expedientes
    SET prospecto_id = NEW.id
    WHERE prospecto_id IS NULL
      AND public.clean_phone_10(telefono) = tel_limpio;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger en la tabla prospectos
DROP TRIGGER IF EXISTS trg_auto_link_expedientes_on_prospecto ON public.prospectos;
CREATE TRIGGER trg_auto_link_expedientes_on_prospecto
  AFTER INSERT OR UPDATE OF telefono
  ON public.prospectos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_link_expedientes_on_prospecto();


-- 4. BACKFILL: Enlazar de forma retroactiva registros existentes que estén huérfanos
DO $$
DECLARE
  r record;
  matching_id text;
  tel_limpio text;
BEGIN
  FOR r IN 
    SELECT id, telefono 
    FROM public.expedientes 
    WHERE prospecto_id IS NULL
  LOOP
    tel_limpio := public.clean_phone_10(r.telefono);
    IF tel_limpio <> '' THEN
      SELECT id INTO matching_id
      FROM public.prospectos
      WHERE public.clean_phone_10(telefono) = tel_limpio
      ORDER BY created_at DESC
      LIMIT 1;

      IF matching_id IS NOT NULL THEN
        UPDATE public.expedientes
        SET prospecto_id = matching_id
        WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END $$;
