-- ============================================================
-- Migración 0183: Subcuentas específicas de Calentadores Solares,
-- Seguridad y Alarmas, y renombramiento de Concreto y Piso Estampado
-- ============================================================

-- 1. Actualizar cuenta 601-01-003 a 'Pub. Concreto y Piso Estampado'
UPDATE public.accounting_accounts
SET nombre = 'Pub. Concreto y Piso Estampado'
WHERE codigo = '601-01-003';

UPDATE public.marketing_subcuentas
SET nombre = 'Pub. Concreto y Piso Estampado',
    servicio_tipos = ARRAY['concreto', 'construccion-piso-estampado', 'obra_civil', 'estampado', 'piso_estampado']
WHERE codigo = '601-01-003';

-- 2. Cuentas contables para Calentadores y Seguridad
INSERT INTO public.accounting_accounts (codigo, nombre, tipo, subtipo, naturaleza)
VALUES
  ('601-01-006', 'Pub. Calentadores Solares', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01-007', 'Pub. Seguridad y Alarmas', 'gasto', 'gastos_comerciales', 'deudora')
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true;

-- 3. Subcuentas de marketing
INSERT INTO public.marketing_subcuentas
  (codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id, es_general, servicio_tipos, orden)
SELECT v.codigo, v.nombre, v.mayor, v.mayor_nombre,
       (SELECT id FROM public.business_units WHERE codigo = v.cc), v.es_general, v.servicios, v.orden
FROM (VALUES
  ('601-01-006', 'Pub. Calentadores Solares', '601-01', 'Mkt Construcción', 'CC-CONSTRUCCION', false, ARRAY['calentador', 'calentadores_solares', 'solar', 'mantenimiento_calentador'], 6),
  ('601-01-007', 'Pub. Seguridad y Alarmas', '601-01', 'Mkt Construcción', 'CC-CONSTRUCCION', false, ARRAY['seguridad', 'alarmas', 'camaras', 'cctv', 'nvr', 'videoporteros', 'control_acceso'], 7)
) AS v(codigo, nombre, mayor, mayor_nombre, cc, es_general, servicios, orden)
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, servicio_tipos = EXCLUDED.servicio_tipos, activo = true;

-- 4. Asociar productos del catálogo a sus subcuentas
-- Piso Estampado
UPDATE public.productos_servicios
SET codigo_subcuenta = '601-01-003'
WHERE id IN ('CAT-014', 'CAT-018');

-- Calentadores Solares
UPDATE public.productos_servicios
SET codigo_subcuenta = '601-01-006'
WHERE id IN ('CAT-008', 'SERV-022');

-- Seguridad y Alarmas
UPDATE public.productos_servicios
SET codigo_subcuenta = '601-01-007'
WHERE id IN (
  'CAT-009', 'CAT-010', 'CAT-011', 'CAT-012', 'CAT-013',
  'CAT-015', 'CAT-016', 'CAT-017', 'CAT-019', 'CAT-020',
  'CAT-021', 'SERV-018', 'SERV-019', 'SERV-020', 'SERV-021'
);

-- 5. Reglas de clasificación de Meta Ads
UPDATE public.reglas_clasificacion
SET codigo_subcuenta = '601-01-006',
    producto_nombre = 'Mantenimiento de calentador solar',
    estado = 'confirmada'
WHERE criterio_valor = '120248570508750534';

UPDATE public.reglas_clasificacion
SET codigo_subcuenta = '601-01-007',
    producto_nombre = 'Kit 4 Cámaras Perimetrales HD + DVR + Disco Duro 1TB (Grabación 24/7)',
    estado = 'confirmada'
WHERE criterio_valor = '120248570754670534';

UPDATE public.reglas_clasificacion
SET codigo_subcuenta = '601-01-004',
    producto_nombre = 'Mantenimiento Residencial y Comercial',
    estado = 'confirmada'
WHERE criterio_valor = '120248570509320534';

UPDATE public.reglas_clasificacion
SET codigo_subcuenta = '601-00-002',
    producto_nombre = 'Posicionamiento de Marca',
    estado = 'confirmada'
WHERE criterio_valor = '120248585657360534';
