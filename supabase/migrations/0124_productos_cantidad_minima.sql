-- Migration 0124: Cantidad mínima de cobro por producto/servicio
-- ============================================================
-- Mínimo que se cobra de cada producto, en su propia unidad (m², pza, ml…),
-- según lo mínimo que vende el proveedor. Si el cliente pide menos, la
-- cotización se calcula con este mínimo (importe mínimo = mínimo × precio).
-- 0 = sin mínimo.

ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS cantidad_minima NUMERIC(12,2) NOT NULL DEFAULT 0;
