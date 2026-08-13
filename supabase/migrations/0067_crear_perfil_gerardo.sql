-- Migration 0067: Crear/Asegurar el perfil del asesor Gerardo en la tabla perfiles
-- y reasignar los prospectos y expedientes sin asesor al id del perfil de Gerardo.

DO $$
DECLARE
  v_gerardo_id uuid;
  v_auth_user_id uuid;
BEGIN
  -- 1. Intentar encontrar un perfil existente que se llame Gerardo
  SELECT id INTO v_gerardo_id
  FROM public.perfiles
  WHERE nombre ILIKE '%gerardo%'
  LIMIT 1;

  -- 2. Si no existe perfil, buscar si existe un usuario sin perfil en auth.users
  -- Se busca por emails conocidos o el primer usuario sin registro en perfiles
  IF v_gerardo_id IS NULL THEN
    SELECT u.id INTO v_auth_user_id
    FROM auth.users u
    LEFT JOIN public.perfiles p ON p.id = u.id
    WHERE p.id IS NULL
    ORDER BY u.created_at DESC
    LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
      v_gerardo_id := v_auth_user_id;
      INSERT INTO public.perfiles (id, nombre, rol, activo)
      VALUES (v_gerardo_id, 'Gerardo', 'asesor', true)
      ON CONFLICT (id) DO UPDATE
      SET nombre = 'Gerardo', rol = 'asesor', activo = true;
    ELSE
      -- Fallback: generar un UUID si no hay usuarios en auth
      v_gerardo_id := gen_random_uuid();
      INSERT INTO public.perfiles (id, nombre, rol, activo)
      VALUES (v_gerardo_id, 'Gerardo', 'asesor', true)
      ON CONFLICT (id) DO NOTHING;
    END IF;
  ELSE
    -- Asegurar que el perfil existente esté activo y con rol asesor
    UPDATE public.perfiles
    SET rol = 'asesor', activo = true
    WHERE id = v_gerardo_id;
  END IF;

  -- 3. Reasignar prospectos y expedientes que no tienen asesor_id asignado (null) a Gerardo
  IF v_gerardo_id IS NOT NULL THEN
    UPDATE public.prospectos
    SET asesor_id = v_gerardo_id
    WHERE asesor_id IS NULL;

    UPDATE public.expedientes
    SET asesor_id = v_gerardo_id
    WHERE asesor_id IS NULL;
  END IF;
END $$;
