-- ============================================================
-- Migración 0185: Subcuentas específicas para Aljibes/Cisternas (601-01-008)
-- y Tinacos (601-01-009) segregadas de Mantenimiento General
-- ============================================================

-- 1. Cuentas contables
INSERT INTO public.accounting_accounts (codigo, nombre, tipo, subtipo, naturaleza)
VALUES
  ('601-01-008', 'Pub. Aljibes y Cisternas', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01-009', 'Pub. Tinacos', 'gasto', 'gastos_comerciales', 'deudora')
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true;

UPDATE public.accounting_accounts
SET nombre = 'Pub. Mantenimiento General e Inmuebles'
WHERE codigo = '601-01-004';

-- 2. Subcuentas de marketing
INSERT INTO public.marketing_subcuentas
  (codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id, es_general, servicio_tipos, orden)
SELECT v.codigo, v.nombre, v.mayor, v.mayor_nombre,
       (SELECT id FROM public.business_units WHERE codigo = v.cc), v.es_general, v.servicios, v.orden
FROM (VALUES
  ('601-01-008', 'Pub. Aljibes y Cisternas', '601-01', 'Mkt Construcción', 'CC-CONSTRUCCION', false, ARRAY['aljibe', 'aljibes', 'cisterna', 'cisternas', 'mantenimiento_cisternas', 'construccion-mantenimiento-cisternas', 'lavado_cisterna'], 8),
  ('601-01-009', 'Pub. Tinacos', '601-01', 'Mkt Construcción', 'CC-CONSTRUCCION', false, ARRAY['tinaco', 'tinacos', 'lavado_tinaco', 'mantenimiento_tinacos', 'construccion-mantenimiento-tinacos'], 9)
) AS v(codigo, nombre, mayor, mayor_nombre, cc, es_general, servicios, orden)
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, servicio_tipos = EXCLUDED.servicio_tipos, activo = true;

UPDATE public.marketing_subcuentas
SET nombre = 'Pub. Mantenimiento General e Inmuebles',
    servicio_tipos = ARRAY['mantenimiento', 'casa_a_punto', 'plomeria', 'mantenimiento_general']
WHERE codigo = '601-01-004';

-- 3. Vincular productos de catálogo
UPDATE public.productos_servicios
SET codigo_subcuenta = '601-01-008'
WHERE id = 'CAT-006';

UPDATE public.productos_servicios
SET codigo_subcuenta = '601-01-009'
WHERE id = 'CAT-007';
