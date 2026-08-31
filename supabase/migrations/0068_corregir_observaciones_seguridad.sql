-- Migración 0068: Corregir Observaciones de Seguridad RLS en Tablas Públicas
-- ==============================================================================================
-- Esta migración resuelve las observaciones de seguridad del Advisor de Supabase
-- habilitando Row Level Security (RLS) en todas las tablas del esquema public que lo tenían desactivado.
-- ==============================================================================================

-- ----------------------------------------------------------------------------------------------
-- 1. Tablas Propias de la Aplicación PWA Sauceda
-- ----------------------------------------------------------------------------------------------

-- Tabla: promociones_expedientes (0047)
ALTER TABLE IF EXISTS public.promociones_expedientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en promociones_expedientes" ON public.promociones_expedientes;
CREATE POLICY "Permitir todo a usuarios autenticados en promociones_expedientes" ON public.promociones_expedientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: fotos_expedientes (0049)
ALTER TABLE IF EXISTS public.fotos_expedientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en fotos_expedientes" ON public.fotos_expedientes;
CREATE POLICY "Permitir todo a usuarios autenticados en fotos_expedientes" ON public.fotos_expedientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: respuestas_rapidas (usada en CRM pero creada de forma manual/dinámica)
ALTER TABLE IF EXISTS public.respuestas_rapidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en respuestas_rapidas" ON public.respuestas_rapidas;
CREATE POLICY "Permitir todo a usuarios autenticados en respuestas_rapidas" ON public.respuestas_rapidas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ----------------------------------------------------------------------------------------------
-- 2. Tablas Externas / Sobrantes (De plantillas, pruebas u otros proyectos en el mismo esquema)
-- ----------------------------------------------------------------------------------------------
-- Se habilita RLS para cerrar la brecha de acceso público anónimo. Al no definir políticas
-- adicionales, se bloquea por defecto todo acceso que no sea mediante la Service Role Key.

ALTER TABLE IF EXISTS public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.community_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.community_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.body_metrics ENABLE ROW LEVEL SECURITY;
