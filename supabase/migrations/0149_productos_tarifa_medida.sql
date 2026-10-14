-- Migration 0149: Medida de las tarifas por escalón
-- ============================================================
-- Las tarifas por escalón (productos_servicios.tarifas_capacidad y
-- proveedor_productos.tarifas_capacidad) ya no son solo por litros:
--   'litros' → tinacos, aljibes, cisternas
--   'tubos'  → calentadores solares (el precio depende del número de tubos)
-- La llave JSON sigue siendo "hasta_litros" por compatibilidad; su valor se
-- interpreta en la medida del producto.

ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS tarifa_medida TEXT NOT NULL DEFAULT 'litros';

UPDATE public.productos_servicios
  SET tarifa_medida = 'tubos'
  WHERE (nombre ILIKE '%calentador%' OR nombre ILIKE '%solar%')
    AND tarifa_medida = 'litros';
