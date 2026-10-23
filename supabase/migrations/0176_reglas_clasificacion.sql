-- Migration 0176: Reglas de clasificación contable de movimientos importados
-- ============================================================
-- Los movimientos que llegan de fuentes externas (Meta Ads hoy; Securo y bancos
-- después) se clasifican con reglas: la primera vez se pregunta a dónde afectan
-- (subcuenta / centro de costos / producto, o línea del P&L) y la respuesta se
-- recuerda. Lo que no tiene regla confirmada aparece en Finanzas → Por clasificar.
--
--   estado     'confirmada' = la decidió una persona
--              'sugerida'   = propuesta automática (se aplica provisionalmente)
--              'pendiente'  = sin propuesta, no afecta el P&L hasta clasificarla
--   accion     'clasificar' | 'ignorar' (p. ej. un cargo que ya entra por otra fuente)
--   criterio   para Meta: campaign_id. Para otras fuentes: texto_contiene,
--              categoria_origen o cuenta_origen.

CREATE TABLE IF NOT EXISTS public.reglas_clasificacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origen TEXT NOT NULL,
  criterio_tipo TEXT NOT NULL,
  criterio_valor TEXT NOT NULL,
  nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('confirmada', 'sugerida', 'pendiente')),
  accion TEXT NOT NULL DEFAULT 'clasificar'
    CHECK (accion IN ('clasificar', 'ignorar')),
  categoria_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  codigo_subcuenta TEXT,
  producto_servicio_id TEXT REFERENCES public.productos_servicios(id) ON DELETE SET NULL,
  producto_nombre TEXT,
  recurrente BOOLEAN NOT NULL DEFAULT false,
  confirmada_por UUID,
  confirmada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origen, criterio_tipo, criterio_valor)
);

CREATE INDEX IF NOT EXISTS idx_reglas_clasificacion_estado
  ON public.reglas_clasificacion(origen, estado);

ALTER TABLE public.reglas_clasificacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth full access reglas_clasificacion" ON public.reglas_clasificacion;
CREATE POLICY "Auth full access reglas_clasificacion" ON public.reglas_clasificacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Campañas de Meta ya clasificadas → reglas. Las cuatro de octubre que se
-- clasificaron solas por su nombre quedan como sugeridas para confirmarlas.
INSERT INTO public.reglas_clasificacion
  (origen, criterio_tipo, criterio_valor, nombre, estado, codigo_subcuenta, producto_nombre, confirmada_at)
SELECT DISTINCT ON (m.campaign_id)
  'meta_ads',
  'campaign_id',
  m.campaign_id,
  m.campaign_name,
  CASE WHEN m.campaign_id IN (
    '120248585657360534', -- Remarketing General - Ecosistema
    '120248570754670534', -- Seguridad y Alarmas
    '120248570509320534', -- Casa a Punto
    '120248570508750534'  -- Calentadores Solares
  ) THEN 'sugerida' ELSE 'confirmada' END,
  m.codigo_subcuenta,
  m.producto_servicio,
  CASE WHEN m.campaign_id IN (
    '120248585657360534', '120248570754670534', '120248570509320534', '120248570508750534'
  ) THEN NULL ELSE now() END
FROM public.meta_ads_gastos m
WHERE m.campaign_id IS NOT NULL AND m.codigo_subcuenta IS NOT NULL
ORDER BY m.campaign_id, m.fecha_inicio DESC
ON CONFLICT (origen, criterio_tipo, criterio_valor) DO NOTHING;
