-- ============================================================
-- MIGRACIÓN 0130: HABILITACIÓN DE RLS EN TABLAS PENDIENTES
-- Asegura que todas las tablas sensibles del CRM tengan RLS activo
-- con acceso completo a usuarios autenticados y service_role.
-- ============================================================

-- 1. Políticas de Seguridad (CREATE POLICY con IF NOT EXISTS o DROP previo)
DO $$
BEGIN
  -- comisiones
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comisiones') THEN
    ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access comisiones" ON public.comisiones;
    CREATE POLICY "Auth full access comisiones" ON public.comisiones FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- comisiones_pagos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comisiones_pagos') THEN
    ALTER TABLE public.comisiones_pagos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access comisiones_pagos" ON public.comisiones_pagos;
    CREATE POLICY "Auth full access comisiones_pagos" ON public.comisiones_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- comisiones_pagos_detalle
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comisiones_pagos_detalle') THEN
    ALTER TABLE public.comisiones_pagos_detalle ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access comisiones_pagos_detalle" ON public.comisiones_pagos_detalle;
    CREATE POLICY "Auth full access comisiones_pagos_detalle" ON public.comisiones_pagos_detalle FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- meta_ads_gastos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meta_ads_gastos') THEN
    ALTER TABLE public.meta_ads_gastos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access meta_ads_gastos" ON public.meta_ads_gastos;
    CREATE POLICY "Auth full access meta_ads_gastos" ON public.meta_ads_gastos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- documentos_ventas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'documentos_ventas') THEN
    ALTER TABLE public.documentos_ventas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access documentos_ventas" ON public.documentos_ventas;
    CREATE POLICY "Auth full access documentos_ventas" ON public.documentos_ventas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- coordinaciones_inspeccion
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coordinaciones_inspeccion') THEN
    ALTER TABLE public.coordinaciones_inspeccion ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access coordinaciones_inspeccion" ON public.coordinaciones_inspeccion;
    CREATE POLICY "Auth full access coordinaciones_inspeccion" ON public.coordinaciones_inspeccion FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- promociones_expedientes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'promociones_expedientes') THEN
    ALTER TABLE public.promociones_expedientes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access promociones_expedientes" ON public.promociones_expedientes;
    CREATE POLICY "Auth full access promociones_expedientes" ON public.promociones_expedientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- fotos_expedientes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fotos_expedientes') THEN
    ALTER TABLE public.fotos_expedientes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access fotos_expedientes" ON public.fotos_expedientes;
    CREATE POLICY "Auth full access fotos_expedientes" ON public.fotos_expedientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- respuestas_rapidas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'respuestas_rapidas') THEN
    ALTER TABLE public.respuestas_rapidas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access respuestas_rapidas" ON public.respuestas_rapidas;
    CREATE POLICY "Auth full access respuestas_rapidas" ON public.respuestas_rapidas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- profiles (si existe en el esquema public)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Auth full access profiles" ON public.profiles;
    CREATE POLICY "Auth full access profiles" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END;
$$;
