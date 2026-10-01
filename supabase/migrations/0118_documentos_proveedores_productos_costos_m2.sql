-- Migration 0118: Estructuración de productos, metros y costo por m2 en documentos de proveedor
-- =========================================================================================
-- Permite enlazar las remisiones y facturas de proveedores directamente a los productos/partidas
-- trabajados en la orden de trabajo, guardando cantidad (m2), costo unitario ($/m2) y desglose
-- de partidas para trazabilidad, historial de precios y evolución de costos en el expediente.

ALTER TABLE public.documentos_proveedores
  ADD COLUMN IF NOT EXISTS producto_id TEXT REFERENCES public.productos_servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS producto_nombre TEXT,
  ADD COLUMN IF NOT EXISTS cantidad NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS unidad TEXT DEFAULT 'm2',
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS partidas JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_documentos_proveedores_producto 
  ON public.documentos_proveedores(producto_id);

CREATE INDEX IF NOT EXISTS idx_documentos_proveedores_prov_fecha 
  ON public.documentos_proveedores(proveedor_id, fecha DESC);
