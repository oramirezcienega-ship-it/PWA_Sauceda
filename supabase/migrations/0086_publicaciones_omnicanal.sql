-- ============================================================
-- MIGRACIÓN 0086: Plataformas Omnicanal para Publicaciones Programadas
-- Soporte para: Facebook, Instagram, TikTok, WhatsApp, Email y Mautic
-- ============================================================

DO $$
BEGIN
  -- Remover constraint existente si existe
  IF EXISTS (
    SELECT 1 
    FROM information_schema.constraint_column_usage 
    WHERE table_name = 'publicaciones_programadas' 
      AND constraint_name = 'publicaciones_programadas_plataforma_check'
  ) THEN
    ALTER TABLE public.publicaciones_programadas 
      DROP CONSTRAINT publicaciones_programadas_plataforma_check;
  END IF;

  -- Recrear constraint con las plataformas omnicanal ampliadas
  ALTER TABLE public.publicaciones_programadas
    ADD CONSTRAINT publicaciones_programadas_plataforma_check
    CHECK (plataforma IN ('facebook', 'instagram', 'tiktok', 'whatsapp', 'email', 'mautic'));
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback si el constraint tenía otro nombre o la tabla no existe en este entorno
    RAISE NOTICE 'No se pudo actualizar constraint de plataforma: %', SQLERRM;
END $$;
