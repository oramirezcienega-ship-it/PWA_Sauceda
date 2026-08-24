-- Migration 0073: Crear y consolidar perfil de Mónica Gómez en la tabla perfiles
-- Garantiza que Mónica Gómez esté activa como asesora en la base de datos de producción y staging.

DO $$
DECLARE
  v_monica_id uuid;
  v_auth_id uuid;
BEGIN
  -- 1. Buscar perfil existente por nombre o email
  SELECT p.id INTO v_monica_id
  FROM public.perfiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.nombre ILIKE '%mónica%' OR p.nombre ILIKE '%monica%' OR u.email ILIKE '%monica%'
  ORDER BY p.created_at ASC
  LIMIT 1;

  -- 2. Si no existe en perfiles, buscar en auth.users
  IF v_monica_id IS NULL THEN
    SELECT id INTO v_auth_id
    FROM auth.users
    WHERE email ILIKE '%monica%'
    LIMIT 1;

    IF v_auth_id IS NOT NULL THEN
      v_monica_id := v_auth_id;
    ELSE
      v_monica_id := gen_random_uuid();
    END IF;
  END IF;

  -- 3. Crear o actualizar el perfil de Mónica Gómez
  INSERT INTO public.perfiles (id, nombre, rol, activo)
  VALUES (v_monica_id, 'Mónica Gómez', 'asesor', true)
  ON CONFLICT (id) DO UPDATE
  SET nombre = 'Mónica Gómez', rol = 'asesor', activo = true;

END $$;
