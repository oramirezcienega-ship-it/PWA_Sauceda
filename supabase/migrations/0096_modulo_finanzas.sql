-- ============================================================
-- MIGRACIÓN 0096: MÓDULO DE FINANZAS INTEGRAL Y PARTIDA DOBLE
-- CRM SAUCEDA (Next.js + Supabase)
-- ============================================================

-- 1. Unidades de Negocio
CREATE TABLE IF NOT EXISTS public.business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Cuentas de Dinero (Caja, Bancos, Tarjetas)
CREATE TABLE IF NOT EXISTS public.money_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'tarjeta_credito')),
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0.00,
  fecha_saldo_inicial date NOT NULL DEFAULT CURRENT_DATE,
  numero_cuenta text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Categorías de Ingresos y Egresos (Mapeadas a Líneas de P&L)
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  linea_pnl text NOT NULL CHECK (linea_pnl IN (
    'ingresos_comisiones',
    'ingresos_ventas',
    'ingresos_otros',
    'costo_directo',
    'costo_marketing',
    'opex_nomina',
    'opex_renta',
    'opex_servicios',
    'opex_otros',
    'gastos_financieros',
    'isr',
    'no_pnl'
  )),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_nombre_tipo UNIQUE (nombre, tipo)
);

-- 4. Catálogo Interno de Cuentas Contables (Partida Doble)
CREATE TABLE IF NOT EXISTS public.accounting_accounts (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('activo', 'pasivo', 'capital', 'ingreso', 'costo', 'gasto', 'impuesto')),
  subtipo text NOT NULL,
  naturaleza text NOT NULL CHECK (naturaleza IN ('deudora', 'acreedora')),
  activo boolean NOT NULL DEFAULT true
);

-- 5. Movimientos / Transacciones Financieras
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_operacion date NOT NULL,
  fecha_pago date,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'egreso', 'traspaso')),
  subtipo_no_pnl text CHECK (subtipo_no_pnl IN (
    'aportacion_capital',
    'retiro_dueno',
    'prestamo_recibido',
    'pago_prestamo',
    'compra_equipo',
    'traspaso'
  )),
  categoria_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  money_account_id uuid REFERENCES public.money_accounts(id) ON DELETE SET NULL,
  money_account_destino_id uuid REFERENCES public.money_accounts(id) ON DELETE SET NULL,
  monto_total numeric(14,2) NOT NULL CHECK (monto_total >= 0),
  subtotal numeric(14,2),
  iva numeric(14,2),
  concepto text NOT NULL,
  contraparte text,
  crm_deal_id text REFERENCES public.expedientes(id) ON DELETE SET NULL,
  comprobante_url text,
  cfdi_uuid text,
  estado text NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pagado', 'pendiente')),
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para transacciones
CREATE INDEX IF NOT EXISTS idx_transactions_fecha_operacion ON public.transactions(fecha_operacion);
CREATE INDEX IF NOT EXISTS idx_transactions_fecha_pago ON public.transactions(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_transactions_tipo ON public.transactions(tipo);
CREATE INDEX IF NOT EXISTS idx_transactions_categoria ON public.transactions(categoria_id);
CREATE INDEX IF NOT EXISTS idx_transactions_business_unit ON public.transactions(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_transactions_money_account ON public.transactions(money_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_crm_deal ON public.transactions(crm_deal_id);
CREATE INDEX IF NOT EXISTS idx_transactions_estado ON public.transactions(estado);

-- 6. Asientos de Diario y Líneas de Asiento (Contabilidad)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  concepto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL REFERENCES public.accounting_accounts(codigo),
  debe numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (debe >= 0),
  haber numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (haber >= 0),
  CONSTRAINT chk_journal_lines_debe_haber CHECK (debe > 0 OR haber > 0)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_fecha ON public.journal_entries(fecha);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tx ON public.journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines(account_code);

-- 7. Activos Fijos y Préstamos
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  fecha_compra date NOT NULL,
  costo numeric(14,2) NOT NULL CHECK (costo >= 0),
  vida_util_meses integer NOT NULL DEFAULT 60 CHECK (vida_util_meses > 0),
  valor_residual numeric(14,2) NOT NULL DEFAULT 0.00,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acreedor text NOT NULL,
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  saldo numeric(14,2) NOT NULL CHECK (saldo >= 0),
  tasa_anual numeric(6,2) DEFAULT 0.00,
  fecha_inicio date NOT NULL,
  plazo_meses integer,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PRECARGA DE DATOS MAESTROS (SEED INICIAL)
-- ============================================================

-- Unidades de Negocio
INSERT INTO public.business_units (nombre, descripcion)
VALUES 
  ('Bienes Raíces', 'Intermediación inmobiliaria, comisiones de venta y renta'),
  ('Construye', 'Construcción, impermeabilización, acabados y remodelaciones'),
  ('Loft Las Cocheras', 'Desarrollo y administración de loft')
ON CONFLICT (nombre) DO NOTHING;

-- Cuentas de Dinero
INSERT INTO public.money_accounts (nombre, tipo, saldo_inicial, fecha_saldo_inicial)
SELECT 'Banco Principal Santander', 'banco', 0.00, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.money_accounts WHERE nombre = 'Banco Principal Santander');

INSERT INTO public.money_accounts (nombre, tipo, saldo_inicial, fecha_saldo_inicial)
SELECT 'Caja Operativa / Efectivo', 'efectivo', 0.00, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.money_accounts WHERE nombre = 'Caja Operativa / Efectivo');

INSERT INTO public.money_accounts (nombre, tipo, saldo_inicial, fecha_saldo_inicial)
SELECT 'Tarjeta de Crédito Corporativa', 'tarjeta_credito', 0.00, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.money_accounts WHERE nombre = 'Tarjeta de Crédito Corporativa');

-- Catálogo de Cuentas Contables
INSERT INTO public.accounting_accounts (codigo, nombre, tipo, subtipo, naturaleza) VALUES
  ('1101', 'Efectivo y Equivalentes de Efectivo', 'activo', 'circulante', 'deudora'),
  ('1102', 'Cuentas por Cobrar a Clientes', 'activo', 'circulante', 'deudora'),
  ('1103', 'IVA Acreditable / A Favor', 'activo', 'circulante', 'deudora'),
  ('1201', 'Mobiliario, Equipo y Activo Fijo', 'activo', 'no_circulante', 'deudora'),
  ('1202', 'Depreciación Acumulada de Activo Fijo', 'activo', 'no_circulante', 'acreedora'),
  ('2101', 'Cuentas por Pagar a Proveedores', 'pasivo', 'corto_plazo', 'acreedora'),
  ('2102', 'Tarjetas de Crédito por Pagar', 'pasivo', 'corto_plazo', 'acreedora'),
  ('2103', 'Impuestos por Pagar', 'pasivo', 'corto_plazo', 'acreedora'),
  ('2201', 'Préstamos Bancarios y Terceros', 'pasivo', 'largo_plazo', 'acreedora'),
  ('3101', 'Capital Social / Aportaciones de Socios', 'capital', 'capital_contribuido', 'acreedora'),
  ('3102', 'Retiros de Socios / Dueño', 'capital', 'capital_contribuido', 'deudora'),
  ('3201', 'Utilidades de Ejercicios Anteriores', 'capital', 'capital_ganado', 'acreedora'),
  ('3301', 'Utilidad del Ejercicio Actual', 'capital', 'capital_ganado', 'acreedora'),
  ('4101', 'Ingresos por Comisiones Inmobiliarias', 'ingreso', 'ingresos_operativos', 'acreedora'),
  ('4102', 'Ingresos por Ventas de Obra y Materiales', 'ingreso', 'ingresos_operativos', 'acreedora'),
  ('4103', 'Otros Ingresos Operativos', 'ingreso', 'ingresos_operativos', 'acreedora'),
  ('5101', 'Costos Directos de Operación y Obra', 'costo', 'costo_ventas', 'deudora'),
  ('5201', 'Costos de Marketing y Publicidad', 'gasto', 'gastos_comerciales', 'deudora'),
  ('6101', 'Gastos Operativos - Nómina y Sueldos', 'gasto', 'opex', 'deudora'),
  ('6102', 'Gastos Operativos - Renta de Inmuebles', 'gasto', 'opex', 'deudora'),
  ('6103', 'Gastos Operativos - Servicios y Software', 'gasto', 'opex', 'deudora'),
  ('6104', 'Gastos Operativos - Otros Gastos Generales', 'gasto', 'opex', 'deudora'),
  ('7101', 'Gastos Financieros e Intereses', 'gasto', 'financiero', 'deudora'),
  ('8101', 'Impuestos a la Utilidad (ISR)', 'impuesto', 'impuestos', 'deudora')
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  tipo = EXCLUDED.tipo,
  subtipo = EXCLUDED.subtipo,
  naturaleza = EXCLUDED.naturaleza;

-- Categorías Estándar
INSERT INTO public.categories (nombre, tipo, linea_pnl) VALUES
  ('Comisiones Inmobiliarias', 'ingreso', 'ingresos_comisiones'),
  ('Ventas de Obra / Directas', 'ingreso', 'ingresos_ventas'),
  ('Otros Ingresos', 'ingreso', 'ingresos_otros'),
  ('Costos Directos de Obra y Gestoría', 'egreso', 'costo_directo'),
  ('Marketing y Publicidad (Ads)', 'egreso', 'costo_marketing'),
  ('Nómina y Asesores', 'egreso', 'opex_nomina'),
  ('Renta de Inmueble', 'egreso', 'opex_renta'),
  ('Servicios Básicos y Software', 'egreso', 'opex_servicios'),
  ('Otros Gastos Operativos', 'egreso', 'opex_otros'),
  ('Gastos Financieros e Intereses', 'egreso', 'gastos_financieros'),
  ('Impuesto Sobre la Renta (ISR)', 'egreso', 'isr'),
  ('Aportación de Capital', 'ingreso', 'no_pnl'),
  ('Retiro del Dueño', 'egreso', 'no_pnl'),
  ('Préstamo Recibido', 'ingreso', 'no_pnl'),
  ('Pago de Préstamo (Capital)', 'egreso', 'no_pnl'),
  ('Compra de Equipo / Activo', 'egreso', 'no_pnl'),
  ('Traspaso entre Cuentas', 'egreso', 'no_pnl')
ON CONFLICT ON CONSTRAINT uq_categories_nombre_tipo DO NOTHING;

-- ============================================================
-- FUNCIÓN TRIGGER: GENERACIÓN AUTOMÁTICA DE PARTIDA DOBLE
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_transaction_journal()
RETURNS TRIGGER AS $$
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
  -- 1. Eliminar asientos previos de esta transacción para regenerar limpiamente
  DELETE FROM public.journal_entries WHERE transaction_id = NEW.id;

  -- 2. Identificar la línea de PnL de la categoría
  IF NEW.categoria_id IS NOT NULL THEN
    SELECT linea_pnl INTO v_linea_pnl FROM public.categories WHERE id = NEW.categoria_id;
  END IF;

  -- 3. Identificar si la cuenta de dinero es tarjeta de crédito
  IF NEW.money_account_id IS NOT NULL THEN
    SELECT tipo INTO v_tipo_cuenta FROM public.money_accounts WHERE id = NEW.money_account_id;
    IF v_tipo_cuenta = 'tarjeta_credito' THEN
      v_cuenta_dinero := '2102'; -- Pasivo Tarjetas
    ELSE
      v_cuenta_dinero := '1101'; -- Efectivo y Bancos
    END IF;
  END IF;

  -- 4. Determinar cuenta contable de Ingreso o Gasto según linea_pnl
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

  -- 5. CASO ESPECIAL: TRASPASO ENTRE CUENTAS
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

    -- Debe cuenta destino, Haber cuenta origen
    INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
      (v_entry_id, v_cuenta_dinero_destino, NEW.monto_total, 0.00),
      (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);

    RETURN NEW;
  END IF;

  -- 6. CASO ESPECIAL: MOVIMIENTOS NO P&L (Balance puro)
  IF v_linea_pnl = 'no_pnl' OR NEW.subtipo_no_pnl IS NOT NULL THEN
    INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
    VALUES (NEW.id, COALESCE(NEW.fecha_pago, NEW.fecha_operacion), 'Movimiento no-P&L: ' || NEW.concepto)
    RETURNING id INTO v_entry_id;

    CASE NEW.subtipo_no_pnl
      WHEN 'aportacion_capital' THEN
        -- Debe Banco, Haber Capital Social
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, v_cuenta_dinero, NEW.monto_total, 0.00),
          (v_entry_id, '3101', 0.00, NEW.monto_total);

      WHEN 'retiro_dueno' THEN
        -- Debe Retiros Dueño, Haber Banco
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, '3102', NEW.monto_total, 0.00),
          (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);

      WHEN 'prestamo_recibido' THEN
        -- Debe Banco, Haber Préstamo por Pagar
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, v_cuenta_dinero, NEW.monto_total, 0.00),
          (v_entry_id, '2201', 0.00, NEW.monto_total);

      WHEN 'pago_prestamo' THEN
        -- Debe Préstamo por Pagar, Haber Banco
        INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
          (v_entry_id, '2201', NEW.monto_total, 0.00),
          (v_entry_id, v_cuenta_dinero, 0.00, NEW.monto_total);

      WHEN 'compra_equipo' THEN
        -- Debe Activo Fijo, Haber Banco (o Cuentas por Pagar si está pendiente)
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
        -- Fallback no P&L
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

  -- 7. CASO: INGRESOS NORMALES (P&L)
  IF NEW.tipo = 'ingreso' THEN
    IF NEW.estado = 'pendiente' THEN
      -- Devengado pendiente de cobro: Debe Cuentas por Cobrar (1102), Haber Ingreso (4xxx)
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Ingreso devengado por cobrar: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, '1102', NEW.monto_total, 0.00),
        (v_entry_id, v_cuenta_ingreso, 0.00, NEW.monto_total);

    ELSIF NEW.estado = 'pagado' AND NEW.fecha_pago IS NOT NULL AND NEW.fecha_pago > NEW.fecha_operacion THEN
      -- Devengado en fecha_operacion
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Ingreso devengado: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, '1102', NEW.monto_total, 0.00),
        (v_entry_id, v_cuenta_ingreso, 0.00, NEW.monto_total);

      -- Cobro en fecha_pago: Debe Banco (1101), Haber Cuentas por Cobrar (1102)
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_pago, 'Cobro de ingreso: ' || NEW.concepto)
      RETURNING id INTO v_entry_pago_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_pago_id, v_cuenta_dinero, NEW.monto_total, 0.00),
        (v_entry_pago_id, '1102', 0.00, NEW.monto_total);

    ELSE
      -- Pagado de contado el mismo día: Debe Banco (1101), Haber Ingreso (4xxx)
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, COALESCE(NEW.fecha_pago, NEW.fecha_operacion), 'Ingreso cobrado: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, v_cuenta_dinero, NEW.monto_total, 0.00),
        (v_entry_id, v_cuenta_ingreso, 0.00, NEW.monto_total);
    END IF;

    RETURN NEW;
  END IF;

  -- 8. CASO: EGRESOS NORMALES (P&L)
  IF NEW.tipo = 'egreso' THEN
    IF NEW.estado = 'pendiente' THEN
      -- Gasto devengado por pagar: Debe Gasto (5xxx/6xxx), Haber Cuentas por Pagar (2101)
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Gasto devengado por pagar: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, v_cuenta_gasto, NEW.monto_total, 0.00),
        (v_entry_id, '2101', 0.00, NEW.monto_total);

    ELSIF NEW.estado = 'pagado' AND NEW.fecha_pago IS NOT NULL AND NEW.fecha_pago > NEW.fecha_operacion THEN
      -- Gasto devengado en fecha_operacion
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_operacion, 'Gasto devengado: ' || NEW.concepto)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_id, v_cuenta_gasto, NEW.monto_total, 0.00),
        (v_entry_id, '2101', 0.00, NEW.monto_total);

      -- Pago en fecha_pago: Debe Cuentas por Pagar (2101), Haber Banco (1101/2102)
      INSERT INTO public.journal_entries (transaction_id, fecha, concepto)
      VALUES (NEW.id, NEW.fecha_pago, 'Liquidación de gasto: ' || NEW.concepto)
      RETURNING id INTO v_entry_pago_id;

      INSERT INTO public.journal_lines (journal_entry_id, account_code, debe, haber) VALUES
        (v_entry_pago_id, '2101', NEW.monto_total, 0.00),
        (v_entry_pago_id, v_cuenta_dinero, 0.00, NEW.monto_total);

    ELSE
      -- Pagado de contado el mismo día: Debe Gasto (5xxx/6xxx), Haber Banco (1101/2102)
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_transaction_journal ON public.transactions;
CREATE TRIGGER trg_sync_transaction_journal
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_transaction_journal();

-- Trigger para borrado limpio
CREATE OR REPLACE FUNCTION public.fn_clean_transaction_journal()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.journal_entries WHERE transaction_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_transaction_journal ON public.transactions;
CREATE TRIGGER trg_clean_transaction_journal
BEFORE DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.fn_clean_transaction_journal();

-- ============================================================
-- MIGRACIÓN DE DATOS HISTÓRICOS DE transacciones_financieras
-- ============================================================
DO $$
DECLARE
  v_bu_br uuid;
  v_acc_banco uuid;
  v_cat_servicios uuid;
  v_cat_marketing uuid;
  v_cat_otros uuid;
  v_cat_ventas uuid;
  v_cat_comisiones uuid;
  r RECORD;
  v_cat_id uuid;
  v_tipo text;
BEGIN
  -- Obtener IDs por defecto
  SELECT id INTO v_bu_br FROM public.business_units WHERE nombre = 'Bienes Raíces' LIMIT 1;
  SELECT id INTO v_acc_banco FROM public.money_accounts WHERE nombre = 'Banco Principal Santander' LIMIT 1;

  SELECT id INTO v_cat_servicios FROM public.categories WHERE nombre = 'Servicios Básicos y Software' LIMIT 1;
  SELECT id INTO v_cat_marketing FROM public.categories WHERE nombre = 'Marketing y Publicidad (Ads)' LIMIT 1;
  SELECT id INTO v_cat_otros FROM public.categories WHERE nombre = 'Otros Gastos Operativos' LIMIT 1;
  SELECT id INTO v_cat_ventas FROM public.categories WHERE nombre = 'Ventas de Obra / Directas' LIMIT 1;
  SELECT id INTO v_cat_comisiones FROM public.categories WHERE nombre = 'Comisiones Inmobiliarias' LIMIT 1;

  -- Migrar transacciones que existan en transacciones_financieras
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transacciones_financieras') THEN
    FOR r IN (
      SELECT * FROM public.transacciones_financieras
      WHERE id NOT IN (SELECT id FROM public.transactions)
    ) LOOP
      v_tipo := CASE WHEN r.tipo = 'ingreso' THEN 'ingreso' ELSE 'egreso' END;

      -- Mapear categoría
      IF LOWER(r.categoria) IN ('servicios', 'suscripciones') THEN
        v_cat_id := v_cat_servicios;
      ELSIF LOWER(r.categoria) = 'marketing' THEN
        v_cat_id := v_cat_marketing;
      ELSIF LOWER(r.categoria) = 'venta' THEN
        v_cat_id := v_cat_ventas;
      ELSIF LOWER(r.categoria) = 'comision' THEN
        v_cat_id := v_cat_comisiones;
      ELSE
        v_cat_id := v_cat_otros;
      END IF;

      INSERT INTO public.transactions (
        id,
        fecha_operacion,
        fecha_pago,
        tipo,
        categoria_id,
        business_unit_id,
        money_account_id,
        monto_total,
        concepto,
        contraparte,
        crm_deal_id,
        estado,
        is_demo,
        created_at
      ) VALUES (
        r.id,
        r.fecha,
        r.fecha,
        v_tipo,
        v_cat_id,
        v_bu_br,
        v_acc_banco,
        r.monto,
        r.concepto,
        'Proveedor / Cliente',
        r.expediente_id,
        'pagado',
        (r.concepto LIKE '%(Demo)%'),
        r.created_at
      );
    END LOOP;
  END IF;
END $$;

-- ============================================================
-- VISTA DE COMPATIBILIDAD CON transacciones_financieras
-- Permite que cotizaciones.ts siga funcionando exactamente igual
-- ============================================================
CREATE OR REPLACE VIEW public.vw_transacciones_financieras_compat AS
SELECT 
  t.id,
  t.fecha_operacion AS fecha,
  CASE WHEN t.tipo = 'egreso' THEN 'gasto' ELSE t.tipo END AS tipo,
  COALESCE(c.nombre, 'otro') AS categoria,
  t.concepto,
  t.monto_total AS monto,
  t.crm_deal_id AS expediente_id,
  t.created_at,
  false AS es_recurrente,
  NULL::uuid AS recurrente_parent_id
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.categoria_id;

-- ============================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura/escritura para administradores y autenticados
CREATE POLICY "Admins full access business_units" ON public.business_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access money_accounts" ON public.money_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access accounting_accounts" ON public.accounting_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access transactions" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access journal_entries" ON public.journal_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access journal_lines" ON public.journal_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access fixed_assets" ON public.fixed_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access loans" ON public.loans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permisos de Service Role (Bypass RLS para server actions)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role, authenticated;

-- ============================================================
-- TRIGGER BIDIRECCIONAL: SINCRONIZAR DE transacciones_financieras A transactions
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_legacy_transacciones_financieras()
RETURNS TRIGGER AS $$
DECLARE
  v_bu_id uuid;
  v_acc_id uuid;
  v_cat_id uuid;
  v_tipo text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.transactions WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT id INTO v_bu_id FROM public.business_units WHERE nombre = 'Construye' LIMIT 1;
  IF v_bu_id IS NULL THEN
    SELECT id INTO v_bu_id FROM public.business_units LIMIT 1;
  END IF;

  SELECT id INTO v_acc_id FROM public.money_accounts WHERE tipo = 'banco' LIMIT 1;
  IF v_acc_id IS NULL THEN
    SELECT id INTO v_acc_id FROM public.money_accounts LIMIT 1;
  END IF;

  v_tipo := CASE WHEN NEW.tipo = 'ingreso' THEN 'ingreso' ELSE 'egreso' END;

  -- Mapear categoria
  IF LOWER(NEW.categoria) = 'venta' THEN
    SELECT id INTO v_cat_id FROM public.categories WHERE linea_pnl = 'ingresos_ventas' LIMIT 1;
  ELSIF LOWER(NEW.categoria) = 'comision' THEN
    SELECT id INTO v_cat_id FROM public.categories WHERE linea_pnl = 'ingresos_comisiones' LIMIT 1;
  ELSIF LOWER(NEW.categoria) = 'costo_venta' THEN
    SELECT id INTO v_cat_id FROM public.categories WHERE linea_pnl = 'costo_directo' LIMIT 1;
  ELSIF LOWER(NEW.categoria) = 'marketing' THEN
    SELECT id INTO v_cat_id FROM public.categories WHERE linea_pnl = 'costo_marketing' LIMIT 1;
  ELSE
    SELECT id INTO v_cat_id FROM public.categories WHERE tipo = v_tipo AND linea_pnl != 'no_pnl' LIMIT 1;
  END IF;

  INSERT INTO public.transactions (
    id,
    fecha_operacion,
    fecha_pago,
    tipo,
    categoria_id,
    business_unit_id,
    money_account_id,
    monto_total,
    concepto,
    contraparte,
    crm_deal_id,
    estado,
    is_demo,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.fecha,
    NEW.fecha,
    v_tipo,
    v_cat_id,
    v_bu_id,
    v_acc_id,
    NEW.monto,
    NEW.concepto,
    'Cliente / Obra',
    NEW.expediente_id,
    'pagado',
    (NEW.concepto LIKE '%(Demo)%'),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    fecha_operacion = EXCLUDED.fecha_operacion,
    fecha_pago = EXCLUDED.fecha_pago,
    tipo = EXCLUDED.tipo,
    categoria_id = EXCLUDED.categoria_id,
    monto_total = EXCLUDED.monto_total,
    concepto = EXCLUDED.concepto,
    crm_deal_id = EXCLUDED.crm_deal_id,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_legacy_transacciones ON public.transacciones_financieras;
CREATE TRIGGER trg_sync_legacy_transacciones
AFTER INSERT OR UPDATE OR DELETE ON public.transacciones_financieras
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_legacy_transacciones_financieras();

