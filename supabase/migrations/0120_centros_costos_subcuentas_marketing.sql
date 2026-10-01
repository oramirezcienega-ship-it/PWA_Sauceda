-- ============================================================
-- Migración 0120: Centros de costos, subcuentas de marketing y póliza por subcuenta
-- ============================================================
-- Jerarquía: Centro de Costos (business_units.codigo) → Cuenta Mayor (601-0x)
-- → Subcuenta / Especialidad (601-0x-00y) → Producto (productos_servicios).
-- La subcuenta es el punto de unión entre ventas (remisiones) y publicidad
-- para medir margen, CAC y ROAS por especialidad.

-- 1. Centros de costos con código
ALTER TABLE public.business_units ADD COLUMN IF NOT EXISTS codigo TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_units_codigo
  ON public.business_units(codigo) WHERE codigo IS NOT NULL;

UPDATE public.business_units SET codigo = 'CC-CONSTRUCCION' WHERE nombre = 'Construye' AND codigo IS NULL;
UPDATE public.business_units SET codigo = 'CC-INMOBILIARIA' WHERE nombre = 'Bienes Raíces' AND codigo IS NULL;
UPDATE public.business_units SET codigo = 'CC-LOFT-COCHERAS' WHERE nombre = 'Loft Las Cocheras' AND codigo IS NULL;

INSERT INTO public.business_units (nombre, descripcion, codigo, activo)
VALUES ('Corporativo', 'Marca, canal de WhatsApp y gastos institucionales', 'CC-CORPORATIVO', true)
ON CONFLICT (nombre) DO UPDATE SET codigo = EXCLUDED.codigo, activo = true;

-- 2. Catálogo de subcuentas de marketing (especialidades)
CREATE TABLE IF NOT EXISTS public.marketing_subcuentas (
  codigo               TEXT PRIMARY KEY,
  nombre               TEXT NOT NULL,
  cuenta_mayor_codigo  TEXT NOT NULL,
  cuenta_mayor_nombre  TEXT NOT NULL,
  business_unit_id     UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  -- Gasto institucional que se prorratea entre todas las especialidades
  es_general           BOOLEAN NOT NULL DEFAULT false,
  -- Tipos de servicio de cotización / OT que pertenecen a esta especialidad
  servicio_tipos       TEXT[] NOT NULL DEFAULT '{}',
  orden                INT NOT NULL DEFAULT 0,
  activo               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_subcuentas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso completo marketing_subcuentas autenticados" ON public.marketing_subcuentas;
CREATE POLICY "Acceso completo marketing_subcuentas autenticados"
  ON public.marketing_subcuentas FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.marketing_subcuentas
  (codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id, es_general, servicio_tipos, orden)
SELECT v.codigo, v.nombre, v.mayor, v.mayor_nombre,
       (SELECT id FROM public.business_units WHERE codigo = v.cc), v.es_general, v.servicios, v.orden
FROM (VALUES
  ('601-01-001', 'Pub. Impermeabilización',      '601-01', 'Mkt Construcción',  'CC-CONSTRUCCION', false, ARRAY['impermeabilizacion'], 1),
  ('601-01-002', 'Pub. Remodelación',            '601-01', 'Mkt Construcción',  'CC-CONSTRUCCION', false, ARRAY['remodelacion','pintura','construccion','acabados'], 2),
  ('601-01-003', 'Pub. Concreto',                '601-01', 'Mkt Construcción',  'CC-CONSTRUCCION', false, ARRAY['concreto','obra_civil'], 3),
  ('601-01-004', 'Pub. Mantenimiento Inmuebles', '601-01', 'Mkt Construcción',  'CC-CONSTRUCCION', false, ARRAY['mantenimiento','mantenimiento_tinacos','tinacos','cisternas'], 4),
  ('601-01-005', 'Pub. Herrería',                '601-01', 'Mkt Construcción',  'CC-CONSTRUCCION', false, ARRAY['herreria','canceleria'], 5),
  ('601-02-001', 'Pub. Compra de Casas',         '601-02', 'Mkt Inmobiliaria',  'CC-INMOBILIARIA', false, ARRAY['compra_casas'], 6),
  ('601-02-002', 'Pub. Prospección Inmobiliaria','601-02', 'Mkt Inmobiliaria',  'CC-INMOBILIARIA', false, ARRAY['inmobiliaria'], 7),
  ('601-00-001', 'Pub. Canal WhatsApp',          '601-00', 'Mkt Institucional', 'CC-CORPORATIVO',  true,  ARRAY[]::TEXT[], 8),
  ('601-00-002', 'Pub. Branding Institucional',  '601-00', 'Mkt Institucional', 'CC-CORPORATIVO',  true,  ARRAY[]::TEXT[], 9)
) AS v(codigo, nombre, mayor, mayor_nombre, cc, es_general, servicios, orden)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Cuentas contables (cuentas mayores y subcuentas de publicidad)
INSERT INTO public.accounting_accounts (codigo, nombre, tipo, subtipo, naturaleza)
VALUES
  ('601-00', 'Mkt Institucional', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01', 'Mkt Construcción', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-02', 'Mkt Inmobiliaria', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01-001', 'Pub. Impermeabilización', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01-002', 'Pub. Remodelación', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01-003', 'Pub. Concreto', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01-004', 'Pub. Mantenimiento Inmuebles', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-01-005', 'Pub. Herrería', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-02-001', 'Pub. Compra de Casas', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-02-002', 'Pub. Prospección Inmobiliaria', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-00-001', 'Pub. Canal WhatsApp', 'gasto', 'gastos_comerciales', 'deudora'),
  ('601-00-002', 'Pub. Branding Institucional', 'gasto', 'gastos_comerciales', 'deudora')
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true;

-- 4. Subcuenta en productos y reasignación de las unidades que pasan a subcuentas
ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS codigo_subcuenta TEXT REFERENCES public.marketing_subcuentas(codigo) ON DELETE SET NULL;

UPDATE public.productos_servicios SET codigo_subcuenta = '601-01-001'
  WHERE codigo_subcuenta IS NULL AND nombre ILIKE '%impermeab%';
UPDATE public.productos_servicios SET codigo_subcuenta = '601-01-004'
  WHERE codigo_subcuenta IS NULL AND (nombre ILIKE '%mantenimiento%' OR nombre ILIKE '%tinaco%' OR nombre ILIKE '%cisterna%');
UPDATE public.productos_servicios SET codigo_subcuenta = '601-01-003'
  WHERE codigo_subcuenta IS NULL AND (nombre ILIKE '%concreto%' OR nombre ILIKE '%trazo%' OR nombre ILIKE '%nivelaci%' OR nombre ILIKE '%firme%');
UPDATE public.productos_servicios SET codigo_subcuenta = '601-01-005'
  WHERE codigo_subcuenta IS NULL AND (nombre ILIKE '%herrer%' OR nombre ILIKE '%cancel%');
UPDATE public.productos_servicios SET codigo_subcuenta = '601-01-002'
  WHERE codigo_subcuenta IS NULL AND (nombre ILIKE '%remodel%' OR nombre ILIKE '%pintura%' OR nombre ILIKE '%acabado%');

UPDATE public.productos_servicios
  SET centro_costo_id = (SELECT id FROM public.business_units WHERE codigo = 'CC-CONSTRUCCION')
  WHERE centro_costo_id IN (
    SELECT id FROM public.business_units
    WHERE nombre IN ('Impermeabilización', 'Construcción y Remodelación', 'Herrería y Cancelería')
  );

UPDATE public.transactions
  SET business_unit_id = (SELECT id FROM public.business_units WHERE codigo = 'CC-CONSTRUCCION')
  WHERE business_unit_id IN (
    SELECT id FROM public.business_units
    WHERE nombre IN ('Impermeabilización', 'Construcción y Remodelación', 'Herrería y Cancelería')
  );

UPDATE public.business_units SET activo = false
  WHERE nombre IN ('Impermeabilización', 'Construcción y Remodelación', 'Herrería y Cancelería');

-- 5. Producto y subcuenta en los movimientos
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS producto_servicio_id TEXT REFERENCES public.productos_servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS codigo_subcuenta TEXT REFERENCES public.marketing_subcuentas(codigo) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_codigo_subcuenta ON public.transactions(codigo_subcuenta);
CREATE INDEX IF NOT EXISTS idx_transactions_producto ON public.transactions(producto_servicio_id);

-- 6. Egresos de marketing: subcuenta/producto completan el centro de costos; sin él no se aceptan
CREATE OR REPLACE FUNCTION public.fn_validar_marketing_transaccion()
RETURNS TRIGGER AS $$
DECLARE
  v_linea text;
BEGIN
  IF NEW.categoria_id IS NULL OR NEW.tipo <> 'egreso' THEN
    RETURN NEW;
  END IF;

  SELECT linea_pnl INTO v_linea FROM public.categories WHERE id = NEW.categoria_id;
  IF v_linea IS DISTINCT FROM 'costo_marketing' THEN
    RETURN NEW;
  END IF;

  IF NEW.codigo_subcuenta IS NULL AND NEW.producto_servicio_id IS NOT NULL THEN
    SELECT codigo_subcuenta INTO NEW.codigo_subcuenta
    FROM public.productos_servicios WHERE id = NEW.producto_servicio_id;
  END IF;

  IF NEW.business_unit_id IS NULL AND NEW.codigo_subcuenta IS NOT NULL THEN
    SELECT business_unit_id INTO NEW.business_unit_id
    FROM public.marketing_subcuentas WHERE codigo = NEW.codigo_subcuenta;
  END IF;

  IF NEW.business_unit_id IS NULL THEN
    RAISE EXCEPTION 'Los egresos de marketing requieren centro de costos (o una subcuenta de marketing).';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_marketing_transaccion ON public.transactions;
CREATE TRIGGER trg_validar_marketing_transaccion
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_validar_marketing_transaccion();

-- 7. Póliza: la publicidad se carga a su subcuenta (601-0x-00y) en vez de la 5201 genérica
CREATE OR REPLACE FUNCTION public.fn_sync_transaction_journal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_entry_id uuid;
  v_entry_pago_id uuid;
  v_linea_pnl text;
  v_cuenta_ingreso text;
  v_cuenta_gasto text;
  v_cuenta_dinero text := '1101';
  v_cuenta_dinero_destino text := '1101';
  v_tipo_cuenta text;
BEGIN
  DELETE FROM public.journal_entries WHERE transaction_id = NEW.id;

  IF NEW.categoria_id IS NOT NULL THEN
    SELECT linea_pnl INTO v_linea_pnl FROM public.categories WHERE id = NEW.categoria_id;
  END IF;

  IF NEW.money_account_id IS NOT NULL THEN
    SELECT tipo INTO v_tipo_cuenta FROM public.money_accounts WHERE id = NEW.money_account_id;
    IF v_tipo_cuenta = 'tarjeta_credito' THEN
      v_cuenta_dinero := '2102';
    ELSE
      v_cuenta_dinero := '1101';
    END IF;
  END IF;

  CASE v_linea_pnl
    WHEN 'ingresos_comisiones' THEN v_cuenta_ingreso := '4101';
    WHEN 'ingresos_ventas'     THEN v_cuenta_ingreso := '4102';
    WHEN 'ingresos_otros'      THEN v_cuenta_ingreso := '4103';
    WHEN 'costo_directo'       THEN v_cuenta_gasto   := '5101';
    WHEN 'costo_marketing'     THEN v_cuenta_gasto   := '5201';
    WHEN 'opex_nomina'         THEN v_cuenta_gasto   := '6101';
    WHEN 'opex_renta'          THEN v_cuenta_gasto   := '6102';
    WHEN 'opex_servicios'      THEN v_cuenta_gasto   := '6103';
    WHEN 'opex_otros'          THEN v_cuenta_gasto   := '6104';
    WHEN 'gastos_financieros'  THEN v_cuenta_gasto   := '7101';
    WHEN 'isr'                 THEN v_cuenta_gasto   := '8101';
    ELSE
      v_cuenta_ingreso := '4103';
      v_cuenta_gasto   := '6104';
  END CASE;

  -- Publicidad con subcuenta: cargar a la subcuenta contable de la especialidad
  IF v_linea_pnl = 'costo_marketing' AND NEW.codigo_subcuenta IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.accounting_accounts WHERE codigo = NEW.codigo_subcuenta) THEN
    v_cuenta_gasto := NEW.codigo_subcuenta;
  END IF;

  IF NEW.tipo = 'traspaso' OR NEW.subtipo_no_pnl = 'traspaso' THEN
    IF NEW.money_account_destino_id IS NOT NULL THEN
      SELECT tipo INTO v_tipo_cuenta FROM public.money_accounts WHERE id = NEW.money_account_destino_id;
      IF v_tipo_cuenta = 'tarjeta_credito' THEN
        v_cuenta_dinero_destino := '2102';
      ELSE
        v_cuenta_dinero_destino := '1101';
      END IF;
    END IF;

    INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
    VALUES (NEW.id, COALESCE(NEW.fecha_pago, NEW.fecha_operacion), 'Traspaso: ' || NEW.concepto)
    RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
      (v_entry_id, v_cuenta_dinero_destino, NEW.monto_total, 0.00),
      (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);

    RETURN NEW;
  END IF;

  IF v_linea_pnl = 'no_pnl' OR NEW.subtipo_no_pnl IS NOT NULL THEN
    INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
    VALUES (NEW.id, COALESCE(NEW.fecha_pago, NEW.fecha_operacion), 'Movimiento no-P&L: ' || NEW.concepto)
    RETURNING id INTO v_entry_id;

    CASE NEW.subtipo_no_pnl
      WHEN 'aportacion_capital' THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, v_cuenta_dinero, NEW.monto_total, 0.00),
          (v_entry_id, '3101', 0.00, NEW.monto_total);

      WHEN 'retiro_dueno' THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, '3102', NEW.monto_total, 0.00),
          (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);

      WHEN 'prestamo_recibido' THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, v_cuenta_dinero, NEW.monto_total, 0.00),
          (v_entry_id, '2201', 0.00, NEW.monto_total);

      WHEN 'pago_prestamo' THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, '2201', NEW.monto_total, 0.00),
          (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);

      WHEN 'compra_equipo' THEN
        IF NEW.estado = 'pendiente' THEN
          INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
            (v_entry_id, '1201', NEW.monto_total, 0.00),
            (v_entry_id, '2101', 0.00, NEW.monto_total);
        ELSE
          INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
            (v_entry_id, '1201', NEW.monto_total, 0.00),
            (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);
        END IF;

      ELSE
        IF NEW.tipo = 'ingreso' THEN
          INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
            (v_entry_id, v_cuenta_dinero, NEW.monto_total, 0.00),
            (v_entry_id, '3101', 0.00, NEW.monto_total);
        ELSE
          INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
            (v_entry_id, '3102', NEW.monto_total, 0.00),
            (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);
        END IF;
    END CASE;

    RETURN NEW;
  END IF;

  IF NEW.tipo = 'ingreso' THEN
    IF NEW.estado = 'pendiente' THEN
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Ingreso devengado por cobrar: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, '1102', NEW.monto_total, 0.00),
        (v_entry_id, v_cuenta_ingreso, 0.00, NEW.monto_total);

    ELSIF NEW.estado = 'pagado' AND NEW.fecha_pago IS NOT NULL AND NEW.fecha_pago > NEW.fecha_operacion THEN
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Ingreso devengado: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, '1102', NEW.monto_total, 0.00),
        (v_entry_id, v_cuenta_ingreso, 0.00, NEW.monto_total);

      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_pago, 'Cobro de ingreso: ' || NEW.concepto)
      RETURNING id INTO v_entry_pago_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_pago_id, v_cuenta_dinero, NEW.monto_total, 0.00),
        (v_entry_pago_id, '1102', 0.00, NEW.monto_total);

    ELSE
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, COALESCE(NEW.fecha_pago, NEW.fecha_operacion), 'Ingreso cobrado: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, v_cuenta_dinero, NEW.monto_total, 0.00),
        (v_entry_id, v_cuenta_ingreso, 0.00, NEW.monto_total);
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.tipo = 'egreso' THEN
    IF NEW.estado = 'pendiente' THEN
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Gasto devengado por pagar: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, v_cuenta_gasto, NEW.monto_total, 0.00),
        (v_entry_id, '2101', 0.00, NEW.monto_total);

    ELSIF NEW.estado = 'pagado' AND NEW.fecha_pago IS NOT NULL AND NEW.fecha_pago > NEW.fecha_operacion THEN
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Gasto devengado: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, v_cuenta_gasto, NEW.monto_total, 0.00),
        (v_entry_id, '2101', 0.00, NEW.monto_total);

      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_pago, 'Liquidación de gasto: ' || NEW.concepto)
      RETURNING id INTO v_entry_pago_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_pago_id, '2101', NEW.monto_total, 0.00),
        (v_entry_pago_id, v_cuenta_dinero, 0.00, NEW.monto_total);

    ELSE
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, COALESCE(NEW.fecha_pago, NEW.fecha_operacion), 'Gasto liquidado: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, v_cuenta_gasto, NEW.monto_total, 0.00),
        (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- 8. Centro de costos y subcuenta en el centro de costos por producto
ALTER TABLE public.remisiones_rentabilidad_productos
  ADD COLUMN IF NOT EXISTS codigo_subcuenta TEXT REFERENCES public.marketing_subcuentas(codigo) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rentabilidad_productos_subcuenta
  ON public.remisiones_rentabilidad_productos(codigo_subcuenta);

-- 9. Tipos de negocio del expediente que pertenecen a cada subcuenta
UPDATE public.marketing_subcuentas m
SET servicio_tipos = (SELECT array_agg(DISTINCT x) FROM unnest(m.servicio_tipos || v.extra) x)
FROM (VALUES
  ('601-01-001', ARRAY['construccion-impermeabilizacion']),
  ('601-01-002', ARRAY['construccion-remodelacion']),
  ('601-01-003', ARRAY['construccion-piso-estampado']),
  ('601-01-004', ARRAY['construccion-mantenimiento-cisternas','construccion-mantenimiento-postventa']),
  ('601-02-001', ARRAY['traspaso_compra','solo_tramite']),
  ('601-02-002', ARRAY['promocion_venta'])
) AS v(codigo, extra)
WHERE m.codigo = v.codigo;
