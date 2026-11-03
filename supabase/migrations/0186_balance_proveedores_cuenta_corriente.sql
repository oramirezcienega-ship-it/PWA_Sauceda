-- Migración 0186: Balance y Cuenta Corriente de Proveedores con asignación de pagos a órdenes/facturas
-- Permite registrar anticipos a proveedor, pagos recibidos de comisiones, pagos entregados y
-- la aplicación directa de cualquier pago a una o varias órdenes de trabajo, remisiones o facturas.

-- 1. Soporte de proveedor en recibos_pago si no existía
ALTER TABLE public.recibos_pago 
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recibos_pago_proveedor ON public.recibos_pago(proveedor_id);

-- 2. Movimientos de la Cuenta Corriente / Balance del Proveedor
CREATE TABLE IF NOT EXISTS public.proveedores_movimientos_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'anticipo_a_proveedor',       -- Dinero que Sauceda le adelanta al proveedor (Egreso Sauceda -> Saldo a favor Sauceda)
    'pago_a_proveedor',           -- Pago de Sauceda al proveedor por orden/factura (Egreso Sauceda -> Amortiza deuda al proveedor)
    'pago_recibido_proveedor',    -- Dinero que el proveedor paga a Sauceda por comisiones/liquidación (Ingreso Sauceda -> Amortiza deuda del proveedor)
    'cargo_orden_trabajo',        -- Costo pactado de una orden asignada al proveedor (Le debemos)
    'comision_por_cobrar',        -- Comisión pactada que el proveedor cobró directo al cliente y nos debe (Nos debe)
    'ajuste_saldo'                -- Ajuste manual a favor o en contra
  )),
  sentido TEXT NOT NULL CHECK (sentido IN ('a_favor_sauceda', 'a_favor_proveedor')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  monto_aplicado NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (monto_aplicado >= 0),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago TEXT NOT NULL DEFAULT 'transferencia' CHECK (metodo_pago IN ('transferencia', 'efectivo', 'cheque', 'compensacion', 'otro')),
  referencia TEXT,
  concepto TEXT NOT NULL,
  comprobante_url TEXT,
  comprobante_nombre TEXT,
  notas TEXT,
  creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prov_movs_balance_prov ON public.proveedores_movimientos_balance(proveedor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_prov_movs_balance_tipo ON public.proveedores_movimientos_balance(tipo);

-- 3. Aplicación detallada de pagos a Órdenes, Servicios o Facturas
-- Permite al administrador decir: "Este pago aplica para tal orden, o tal servicio, o factura"
CREATE TABLE IF NOT EXISTS public.proveedores_aplicaciones_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL REFERENCES public.proveedores_movimientos_balance(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  orden_trabajo_id UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  documento_proveedor_id UUID REFERENCES public.documentos_proveedores(id) ON DELETE SET NULL,
  tipo_destino TEXT NOT NULL CHECK (tipo_destino IN ('orden_trabajo', 'factura_proveedor', 'remision_proveedor', 'servicio_otro')),
  folio_destino TEXT,
  descripcion_destino TEXT NOT NULL,
  monto_aplicado NUMERIC(12,2) NOT NULL CHECK (monto_aplicado > 0),
  notas TEXT,
  creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prov_aplicaciones_mov ON public.proveedores_aplicaciones_pago(movimiento_id);
CREATE INDEX IF NOT EXISTS idx_prov_aplicaciones_ot ON public.proveedores_aplicaciones_pago(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_prov_aplicaciones_doc ON public.proveedores_aplicaciones_pago(documento_proveedor_id);
CREATE INDEX IF NOT EXISTS idx_prov_aplicaciones_prov ON public.proveedores_aplicaciones_pago(proveedor_id);

-- 4. Trigger para mantener sincronizado `monto_aplicado` en `proveedores_movimientos_balance`
CREATE OR REPLACE FUNCTION public.actualizar_monto_aplicado_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.movimiento_id;
  ELSE
    target_id := NEW.movimiento_id;
  END IF;

  UPDATE public.proveedores_movimientos_balance
  SET monto_aplicado = COALESCE((
    SELECT SUM(monto_aplicado)
    FROM public.proveedores_aplicaciones_pago
    WHERE movimiento_id = target_id
  ), 0.00),
  updated_at = now()
  WHERE id = target_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actualizar_monto_aplicado ON public.proveedores_aplicaciones_pago;

CREATE TRIGGER trg_actualizar_monto_aplicado
AFTER INSERT OR UPDATE OR DELETE ON public.proveedores_aplicaciones_pago
FOR EACH ROW EXECUTE FUNCTION public.actualizar_monto_aplicado_movimiento();

-- 5. RLS Policies
ALTER TABLE public.proveedores_movimientos_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores_aplicaciones_pago ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'proveedores_movimientos_balance' 
    AND policyname = 'Permitir todo a usuarios autenticados en proveedores_movimientos_balance'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en proveedores_movimientos_balance"
      ON public.proveedores_movimientos_balance TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'proveedores_aplicaciones_pago' 
    AND policyname = 'Permitir todo a usuarios autenticados en proveedores_aplicaciones_pago'
  ) THEN
    CREATE POLICY "Permitir todo a usuarios autenticados en proveedores_aplicaciones_pago"
      ON public.proveedores_aplicaciones_pago TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
