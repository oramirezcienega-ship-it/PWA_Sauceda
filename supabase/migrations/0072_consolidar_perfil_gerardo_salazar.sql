-- Migration 0072: Consolidar perfil y expedientes de Gerardo Salazar
-- Asegura que Gerardo Salazar aparezca con su nombre completo y que todos los expedientes
-- asignados a perfiles antiguos de Gerardo queden unificados a su ID activo de Auth.

DO $$
DECLARE
  v_gerardo_id uuid;
  v_old_ids uuid[];
BEGIN
  -- 1. Obtener el ID activo de Auth/perfil para Gerardo (por email o nombre)
  SELECT p.id INTO v_gerardo_id
  FROM public.perfiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'gerardoortizfonseca@gmail.com' OR p.nombre ILIKE '%gerardo%'
  ORDER BY (u.email = 'gerardoortizfonseca@gmail.com') DESC, p.created_at ASC
  LIMIT 1;

  IF v_gerardo_id IS NOT NULL THEN
    -- Actualizar el nombre completo a Gerardo Salazar y asegurar rol de asesor activo
    UPDATE public.perfiles
    SET nombre = 'Gerardo Salazar', rol = 'asesor', activo = true
    WHERE id = v_gerardo_id;

    -- Coleccionar cualquier otro ID huérfano de Gerardo
    SELECT array_agg(id) INTO v_old_ids
    FROM public.perfiles
    WHERE nombre ILIKE '%gerardo%' AND id <> v_gerardo_id;

    IF v_old_ids IS NOT NULL AND array_length(v_old_ids, 1) > 0 THEN
      UPDATE public.expedientes
      SET asesor_id = v_gerardo_id
      WHERE asesor_id = ANY(v_old_ids);

      UPDATE public.prospectos
      SET asesor_id = v_gerardo_id
      WHERE asesor_id = ANY(v_old_ids);
    END IF;
  END IF;
END $$;
