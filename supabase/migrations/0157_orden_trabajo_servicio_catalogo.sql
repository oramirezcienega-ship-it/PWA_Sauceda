-- Migration 0157: La orden de trabajo sabe qué servicio del catálogo y qué cantidad/capacidad es (fase 3)
-- ============================================================
-- Con eso el CRM compara el costo de cada proveedor para ese servicio y capacidad
-- (oferta_variante_costos / tarifas) y llena el proveedor y su costo en la orden.

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS producto_id TEXT REFERENCES public.productos_servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cantidad_servicio NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_producto ON public.ordenes_trabajo(producto_id);
