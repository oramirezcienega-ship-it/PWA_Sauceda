-- ============================================================
-- MIGRACIÓN 0129: MÓDULO DE PROYECCIONES FINANCIERAS Y MODELO DETERMINÍSTICO
-- CRM SAUCEDA (Next.js + Supabase)
-- ============================================================

-- 1. Tabla de Escenarios Financieros
CREATE TABLE IF NOT EXISTS public.fin_escenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,                                 -- 'Conservador' | 'Base' | 'Optimista' | personalizado
  periodo_inicio date NOT NULL,                         -- e.g. 2026-10-01
  periodo_fin date NOT NULL,                            -- e.g. 2027-12-01
  fecha_corte_real date,                                -- Fecha límite hasta donde se toman datos reales
  es_activo boolean NOT NULL DEFAULT false,             -- Solo un escenario activo por defecto
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_escenarios_activo ON public.fin_escenarios(es_activo);

-- 2. Tabla de Mapeo de Campañas de Marketing a Tipo de Negocio
CREATE TABLE IF NOT EXISTS public.fin_mapeo_marketing (
  producto_servicio text PRIMARY KEY,
  tipo_negocio text,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Precarga del mapeo inicial de marketing (editable por el usuario)
INSERT INTO public.fin_mapeo_marketing (producto_servicio, tipo_negocio, business_unit_id)
SELECT 
  m.producto_servicio,
  m.tipo_negocio,
  (SELECT id FROM public.business_units WHERE nombre ILIKE m.bu_patron LIMIT 1)
FROM (
  VALUES
    ('Impermeabilización Techos y Muros', 'construccion-impermeabilizacion', '%Construye%'),
    ('Remodelación Integral', 'construccion-remodelacion', '%Construye%'),
    ('Obras y Firmes de Concreto', 'construccion-piso-estampado', '%Construye%'),
    ('Mantenimiento Residencial y Comercial', 'construccion-mantenimiento-postventa', '%Construye%'),
    ('Herrería y Estructuras', 'construccion', '%Construye%'),
    ('Compra Directa / Trámites', 'solo_tramite', '%Bienes Raíces%'),
    ('Captación Leads Inmobiliarios', 'solo_tramite', '%Bienes Raíces%'),
    ('Atención Directa WhatsApp', NULL, NULL),
    ('Posicionamiento de Marca', NULL, NULL)
) AS m(producto_servicio, tipo_negocio, bu_patron)
ON CONFLICT (producto_servicio) DO UPDATE SET
  tipo_negocio = EXCLUDED.tipo_negocio,
  business_unit_id = COALESCE(EXCLUDED.business_unit_id, fin_mapeo_marketing.business_unit_id);

-- 3. Tabla de Líneas de Negocio Proyectadas por Escenario
CREATE TABLE IF NOT EXISTS public.fin_lineas_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escenario_id uuid NOT NULL REFERENCES public.fin_escenarios(id) ON DELETE CASCADE,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  nombre text NOT NULL,                                 -- e.g. 'Impermeabilización', 'Trámite INFONAVIT'
  tipo_negocio text,                                    -- liga con expedientes.tipo_negocio (null si negocio nuevo)
  origen text NOT NULL CHECK (origen IN ('existente', 'nuevo')) DEFAULT 'existente',
  modelo text NOT NULL CHECK (modelo IN ('embudo', 'manual')) DEFAULT 'embudo',
  esquema_cobro jsonb NOT NULL DEFAULT '[{"pct": 1, "desfase_meses": 0}]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_lineas_plan_escenario ON public.fin_lineas_plan(escenario_id);
CREATE INDEX IF NOT EXISTS idx_fin_lineas_plan_bu ON public.fin_lineas_plan(business_unit_id);

-- 4. Tabla de Supuestos Mensuales por Línea
CREATE TABLE IF NOT EXISTS public.fin_supuestos_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea_id uuid NOT NULL REFERENCES public.fin_lineas_plan(id) ON DELETE CASCADE,
  mes date NOT NULL,                                    -- Primer día del mes (YYYY-MM-01)
  leads numeric DEFAULT 0,
  pct_a_cotizacion numeric DEFAULT 0,
  pct_cierre numeric DEFAULT 0,
  operaciones_manual numeric DEFAULT 0,
  ticket_promedio numeric DEFAULT 0,
  margen_pct numeric DEFAULT 0,
  pct_comision_asesor numeric DEFAULT 0,
  gasto_ads numeric,
  costo_por_lead numeric,
  fuente text NOT NULL CHECK (fuente IN ('real', 'promedio_real', 'manual')) DEFAULT 'promedio_real',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fin_supuestos_linea_mes UNIQUE (linea_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_fin_supuestos_mes_linea ON public.fin_supuestos_mes(linea_id);
CREATE INDEX IF NOT EXISTS idx_fin_supuestos_mes_fecha ON public.fin_supuestos_mes(mes);

-- 5. Tabla de Gastos Fijos Proyectados por Escenario y Unidad
CREATE TABLE IF NOT EXISTS public.fin_fijos_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escenario_id uuid NOT NULL REFERENCES public.fin_escenarios(id) ON DELETE CASCADE,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  concepto text NOT NULL,
  linea_pnl text NOT NULL CHECK (linea_pnl IN (
    'costo_marketing',
    'opex_nomina',
    'opex_renta',
    'opex_servicios',
    'opex_otros',
    'gastos_financieros',
    'isr'
  )),
  mes date NOT NULL,
  monto numeric NOT NULL DEFAULT 0,
  fuente text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_fijos_plan_escenario ON public.fin_fijos_plan(escenario_id);
CREATE INDEX IF NOT EXISTS idx_fin_fijos_plan_bu ON public.fin_fijos_plan(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_fin_fijos_plan_mes ON public.fin_fijos_plan(mes);

-- ============================================================
-- TABLAS AUXILIARES / DEPENDENCIAS EXTERNAS
-- ============================================================

-- Asegurar tabla de gastos de Meta Ads si no existe
CREATE TABLE IF NOT EXISTS public.meta_ads_gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text,
  centro_costos text,
  cuenta_mayor text,
  codigo_subcuenta text,
  nombre_subcuenta text,
  producto_servicio text,
  gasto numeric(14,2) NOT NULL DEFAULT 0,
  impresiones integer NOT NULL DEFAULT 0,
  clics integer NOT NULL DEFAULT 0,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  estatus_contable text NOT NULL DEFAULT 'PENDIENTE',
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- VISTAS ANALÍTICAS
-- ============================================================

-- Vista 1: Base Real Mensual por tipo_negocio
-- Agrupa leads, cotizaciones, cierres, ticket, margen, comisión y costo por lead
CREATE OR REPLACE VIEW public.v_fin_base_real_mensual AS
WITH meses_negocio AS (
  SELECT DISTINCT
    date_trunc('month', created_at)::date AS mes,
    tipo_negocio
  FROM public.expedientes
  WHERE tipo_negocio IS NOT NULL
),
leads_agg AS (
  SELECT
    date_trunc('month', created_at)::date AS mes,
    tipo_negocio,
    count(*)::numeric AS leads
  FROM public.expedientes
  WHERE COALESCE(no_viable, false) = false
    AND COALESCE(etapa, '') != 'fuera_de_zona'
    AND tipo_negocio IS NOT NULL
  GROUP BY 1, 2
),
cotizaciones_agg AS (
  SELECT
    date_trunc('month', c.created_at)::date AS mes,
    e.tipo_negocio,
    count(DISTINCT c.id)::numeric AS cotizaciones,
    count(DISTINCT CASE 
      WHEN c.estatus IN ('aceptada', 'instalacion') 
        OR e.etapa IN ('cerrado', 'propuesta-aceptada') 
      THEN c.id 
    END)::numeric AS cierres,
    AVG(CASE 
      WHEN c.estatus IN ('aceptada', 'instalacion') 
        OR e.etapa IN ('cerrado', 'propuesta-aceptada') 
      THEN COALESCE(rf.monto_total, c.precio_final)
    END) AS ticket_promedio
  FROM public.cotizaciones c
  JOIN public.expedientes e ON (c.expediente_id = e.id OR c.prospecto_id = e.prospecto_id)
  LEFT JOIN public.remisiones_facturas rf ON rf.cotizacion_id = c.id
  WHERE e.tipo_negocio IS NOT NULL
  GROUP BY 1, 2
),
margen_agg AS (
  SELECT
    date_trunc('month', rp.fecha)::date AS mes,
    e.tipo_negocio,
    SUM(rp.utilidad + rp.comision)::numeric / NULLIF(SUM(rp.ingreso), 0)::numeric AS margen_pct
  FROM public.remisiones_rentabilidad_productos rp
  JOIN public.expedientes e ON rp.expediente_id = e.id
  WHERE e.tipo_negocio IS NOT NULL
  GROUP BY 1, 2
),
comisiones_agg AS (
  SELECT
    date_trunc('month', com.fecha)::date AS mes,
    e.tipo_negocio,
    SUM(com.monto_comision)::numeric / NULLIF(SUM(com.monto_venta), 0)::numeric AS pct_comision_asesor
  FROM public.comisiones com
  JOIN public.expedientes e ON com.expediente_id = e.id
  WHERE e.tipo_negocio IS NOT NULL
  GROUP BY 1, 2
),
marketing_agg AS (
  SELECT
    date_trunc('month', m.fecha_inicio)::date AS mes,
    map.tipo_negocio,
    SUM(m.gasto)::numeric AS gasto_marketing
  FROM public.meta_ads_gastos m
  JOIN public.fin_mapeo_marketing map ON m.producto_servicio = map.producto_servicio
  WHERE map.tipo_negocio IS NOT NULL
  GROUP BY 1, 2
),
cierres_recientes AS (
  -- Conteo de cierres en los últimos 3 meses para cálculo de confiabilidad
  SELECT
    e.tipo_negocio,
    count(DISTINCT c.id)::numeric AS cierres_ultimos_3m
  FROM public.cotizaciones c
  JOIN public.expedientes e ON (c.expediente_id = e.id OR c.prospecto_id = e.prospecto_id)
  WHERE (c.estatus IN ('aceptada', 'instalacion') OR e.etapa IN ('cerrado', 'propuesta-aceptada'))
    AND c.created_at >= (CURRENT_DATE - INTERVAL '3 months')
  GROUP BY 1
)
SELECT
  mn.mes,
  mn.tipo_negocio,
  COALESCE(l.leads, 0) AS leads,
  COALESCE(cot.cotizaciones, 0) AS cotizaciones,
  COALESCE(cot.cierres, 0) AS cierres,
  CASE 
    WHEN COALESCE(l.leads, 0) > 0 THEN ROUND(COALESCE(cot.cotizaciones, 0) / l.leads, 4)
    ELSE 0 
  END AS pct_a_cotizacion,
  CASE 
    WHEN COALESCE(cot.cotizaciones, 0) > 0 THEN ROUND(COALESCE(cot.cierres, 0) / cot.cotizaciones, 4)
    ELSE 0 
  END AS pct_cierre,
  ROUND(COALESCE(cot.ticket_promedio, 0), 2) AS ticket_promedio,
  ROUND(COALESCE(mrg.margen_pct, 0.40), 4) AS margen_pct, -- default histórico 40% si no hay remisiones
  ROUND(COALESCE(com.pct_comision_asesor, 0.05), 4) AS pct_comision_asesor, -- default histórico 5%
  ROUND(COALESCE(mkt.gasto_marketing, 0), 2) AS gasto_marketing,
  CASE 
    WHEN COALESCE(l.leads, 0) > 0 THEN ROUND(COALESCE(mkt.gasto_marketing, 0) / l.leads, 2)
    ELSE 0 
  END AS costo_por_lead,
  CASE
    WHEN COALESCE(cr.cierres_ultimos_3m, 0) >= 10 THEN 'alta'
    WHEN COALESCE(cr.cierres_ultimos_3m, 0) >= 3 THEN 'media'
    ELSE 'baja'
  END AS confiabilidad
FROM meses_negocio mn
LEFT JOIN leads_agg l ON mn.mes = l.mes AND mn.tipo_negocio = l.tipo_negocio
LEFT JOIN cotizaciones_agg cot ON mn.mes = cot.mes AND mn.tipo_negocio = cot.tipo_negocio
LEFT JOIN margen_agg mrg ON mn.mes = mrg.mes AND mn.tipo_negocio = mrg.tipo_negocio
LEFT JOIN comisiones_agg com ON mn.mes = com.mes AND mn.tipo_negocio = com.tipo_negocio
LEFT JOIN marketing_agg mkt ON mn.mes = mkt.mes AND mn.tipo_negocio = mkt.tipo_negocio
LEFT JOIN cierres_recientes cr ON mn.tipo_negocio = cr.tipo_negocio;

-- Vista 2: P&L Real Mensual desde Transacciones Contables
-- Debe cuadrar exactamente con obtenerEstadoResultados()
CREATE OR REPLACE VIEW public.v_fin_pnl_real_mensual AS
SELECT
  date_trunc('month', t.fecha_operacion)::date AS mes,
  t.business_unit_id,
  bu.nombre AS business_unit_nombre,
  c.linea_pnl,
  c.tipo AS categoria_tipo,
  SUM(t.monto_total)::numeric(14, 2) AS monto_total
FROM public.transactions t
JOIN public.categories c ON t.categoria_id = c.id
LEFT JOIN public.business_units bu ON t.business_unit_id = bu.id
WHERE t.is_demo = false
  AND c.linea_pnl != 'no_pnl'
  AND t.estado = 'pagado'
GROUP BY 1, 2, 3, 4, 5;

-- ============================================================
-- SEGURIDAD (RLS) Y POLÍTICAS
-- ============================================================

ALTER TABLE public.fin_escenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_lineas_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_supuestos_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_fijos_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_mapeo_marketing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access fin_escenarios" ON public.fin_escenarios;
CREATE POLICY "Admins full access fin_escenarios" ON public.fin_escenarios 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access fin_lineas_plan" ON public.fin_lineas_plan;
CREATE POLICY "Admins full access fin_lineas_plan" ON public.fin_lineas_plan 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access fin_supuestos_mes" ON public.fin_supuestos_mes;
CREATE POLICY "Admins full access fin_supuestos_mes" ON public.fin_supuestos_mes 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access fin_fijos_plan" ON public.fin_fijos_plan;
CREATE POLICY "Admins full access fin_fijos_plan" ON public.fin_fijos_plan 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access fin_mapeo_marketing" ON public.fin_mapeo_marketing;
CREATE POLICY "Admins full access fin_mapeo_marketing" ON public.fin_mapeo_marketing 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role, authenticated;
GRANT SELECT ON public.v_fin_base_real_mensual TO authenticated, service_role;
GRANT SELECT ON public.v_fin_pnl_real_mensual TO authenticated, service_role;
