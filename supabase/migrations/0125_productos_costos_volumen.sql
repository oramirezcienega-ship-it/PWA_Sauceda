-- Migration 0125: Costo del proveedor por rango de cantidad (volumen)
-- ============================================================
-- Arreglo JSON [{ "hasta": 100, "costo": 150 }, { "hasta": 200, "costo": 140 }, ...]
-- en la unidad del producto (m², pza…). El costo unitario aplicable es el del
-- primer rango cuyo "hasta" cubre la cantidad; por encima del último rango se
-- usa el último. Es información interna (Sofía nunca la ve); si no hay rangos
-- se usa costo_unitario.

ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS costos_volumen JSONB NOT NULL DEFAULT '[]'::jsonb;
