-- ============================================================
-- Migración 0119: La remisión manda en Finanzas + Centro de costos por producto
-- ============================================================
-- Al aplicarse una remisión/factura de venta, sus importes definitivos
-- (venta, costo de proveedor, costo financiero de terminal/pasarela y
-- comisión del asesor) se reflejan en Finanzas como movimientos ligados
-- a la remisión. Al editar la remisión se actualizan esos mismos
-- movimientos (y su partida doble) en vez de duplicarse.
--
-- Además, cada remisión se desglosa por producto/servicio del catálogo
-- para medir la rentabilidad y el retorno de cada producto.

-- 1. Vínculo de cada movimiento financiero con el documento que lo originó
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS origen_modulo   TEXT,
  ADD COLUMN IF NOT EXISTS origen_id       TEXT,
  ADD COLUMN IF NOT EXISTS origen_concepto TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_origen
  ON public.transactions(origen_modulo, origen_id, origen_concepto)
  WHERE origen_modulo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_origen_id
  ON public.transactions(origen_id)
  WHERE origen_id IS NOT NULL;

-- 2. Centro de costos: rentabilidad por producto de cada remisión
CREATE TABLE IF NOT EXISTS public.remisiones_rentabilidad_productos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remision_factura_id   UUID NOT NULL REFERENCES public.remisiones_facturas(id) ON DELETE CASCADE,
  fecha                 DATE NOT NULL DEFAULT CURRENT_DATE,
  producto_servicio_id  TEXT REFERENCES public.productos_servicios(id) ON DELETE SET NULL,
  producto_nombre       TEXT NOT NULL DEFAULT '',
  cantidad              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  unidad                TEXT NOT NULL DEFAULT 'm2',
  ingreso               NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  costo_proveedor       NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  costo_financiero      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  comision              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  utilidad              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  orden_trabajo_id      UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  expediente_id         TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rentabilidad_productos_remision
  ON public.remisiones_rentabilidad_productos(remision_factura_id);
CREATE INDEX IF NOT EXISTS idx_rentabilidad_productos_producto
  ON public.remisiones_rentabilidad_productos(producto_servicio_id);
CREATE INDEX IF NOT EXISTS idx_rentabilidad_productos_fecha
  ON public.remisiones_rentabilidad_productos(fecha);

ALTER TABLE public.remisiones_rentabilidad_productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo rentabilidad productos autenticados" ON public.remisiones_rentabilidad_productos;
CREATE POLICY "Acceso completo rentabilidad productos autenticados"
  ON public.remisiones_rentabilidad_productos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Asegurar categoría para el costo financiero de terminal/pasarela
INSERT INTO public.categories (nombre, tipo, linea_pnl, activo)
SELECT 'Comisiones Bancarias / Terminal', 'egreso', 'gastos_financieros', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE linea_pnl = 'gastos_financieros' AND activo IS TRUE
)
ON CONFLICT (nombre, tipo) DO UPDATE SET activo = true;
