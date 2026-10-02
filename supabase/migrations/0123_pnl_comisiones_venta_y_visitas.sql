-- ============================================================
-- P&L: comisiones por venta como costo directo y comisiones por
-- visitas técnicas como renglón propio dentro de OPEX.
-- ------------------------------------------------------------
-- * costo_comisiones_venta  → 2. Costos Directos (cuenta 5102)
-- * opex_comisiones_visitas → 4. OPEX (cuenta 6105)
-- Reclasifica las comisiones de remisión existentes y refleja en
-- Finanzas las comisiones por inspección que aún no tenían movimiento.
-- ============================================================

-- 1. Nuevas líneas del P&L
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_linea_pnl_check;
ALTER TABLE public.categories ADD CONSTRAINT categories_linea_pnl_check CHECK (linea_pnl IN (
  'ingresos_comisiones',
  'ingresos_ventas',
  'ingresos_otros',
  'costo_directo',
  'costo_comisiones_venta',
  'costo_marketing',
  'opex_nomina',
  'opex_comisiones_visitas',
  'opex_renta',
  'opex_servicios',
  'opex_otros',
  'gastos_financieros',
  'isr',
  'no_pnl'
));

-- 2. Cuentas contables
INSERT INTO public.accounting_accounts (codigo, nombre, tipo, subtipo, naturaleza)
SELECT '5102', 'Comisiones sobre Ventas', 'costo', 'costo_ventas', 'deudora'
WHERE NOT EXISTS (SELECT 1 FROM public.accounting_accounts WHERE codigo = '5102');

INSERT INTO public.accounting_accounts (codigo, nombre, tipo, subtipo, naturaleza)
SELECT '6105', 'Gastos Operativos - Comisiones por Visitas Técnicas', 'gasto', 'opex', 'deudora'
WHERE NOT EXISTS (SELECT 1 FROM public.accounting_accounts WHERE codigo = '6105');

-- 3. Categorías
INSERT INTO public.categories (nombre, tipo, linea_pnl)
SELECT 'Comisiones por Venta', 'egreso', 'costo_comisiones_venta'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE linea_pnl = 'costo_comisiones_venta');

INSERT INTO public.categories (nombre, tipo, linea_pnl)
SELECT 'Comisiones por Visitas Técnicas', 'egreso', 'opex_comisiones_visitas'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE linea_pnl = 'opex_comisiones_visitas');

-- 4. Póliza: mapear las nuevas líneas a sus cuentas
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_sync_transaction_journal'::regproc);
BEGIN
  IF position('costo_comisiones_venta' IN v_def) = 0 THEN
    v_def := replace(
      v_def,
      'WHEN ''opex_nomina''         THEN v_cuenta_gasto   := ''6101'';',
      'WHEN ''opex_nomina''         THEN v_cuenta_gasto   := ''6101'';
    WHEN ''costo_comisiones_venta''  THEN v_cuenta_gasto := ''5102'';
    WHEN ''opex_comisiones_visitas'' THEN v_cuenta_gasto := ''6105'';'
    );
    IF position('costo_comisiones_venta' IN v_def) = 0 THEN
      RAISE EXCEPTION 'No se pudo actualizar fn_sync_transaction_journal';
    END IF;
    EXECUTE v_def;
  END IF;
END $$;

-- 5. Reclasificar las comisiones de remisión ya registradas (regenera su póliza)
UPDATE public.transactions
SET categoria_id = (SELECT id FROM public.categories WHERE linea_pnl = 'costo_comisiones_venta' LIMIT 1),
    updated_at = now()
WHERE origen_modulo = 'remision' AND origen_concepto = 'comision';

-- 6. Comisiones por inspección sin movimiento en Finanzas
INSERT INTO public.transactions (
  fecha_operacion, fecha_pago, tipo, categoria_id, monto_total, concepto, contraparte,
  crm_deal_id, estado, is_demo, origen_modulo, origen_id, origen_concepto
)
SELECT
  c.fecha,
  CASE WHEN c.estatus = 'pagada' THEN c.fecha END,
  'egreso',
  (SELECT id FROM public.categories WHERE linea_pnl = 'opex_comisiones_visitas' LIMIT 1),
  c.monto_comision,
  'Comisión ' || COALESCE(p.nombre, 'Asesor') || ' - ' || COALESCE(c.detalles_calculo->>'clienteNombre', 'Inspección Técnica'),
  COALESCE(p.nombre, 'Asesor'),
  c.expediente_id,
  CASE WHEN c.estatus = 'pagada' THEN 'pagado' ELSE 'pendiente' END,
  false,
  'comision',
  c.id::text,
  'comision'
FROM public.comisiones c
LEFT JOIN public.perfiles p ON p.id = c.asesor_id
WHERE c.tipo_comision = 'inspeccion'
  AND c.estatus <> 'cancelada'
  AND COALESCE(c.monto_comision, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.origen_modulo = 'comision' AND t.origen_id = c.id::text
  );
