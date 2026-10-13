-- Migration 0147: Costo del proveedor por capacidad (litros)
-- ============================================================
-- Para servicios que se cobran por tamaño (tinacos, aljibes/cisternas):
-- [{ "hasta_litros": 1100, "costo": 450 }, { "hasta_litros": 2500, "costo": 600 }, ...]
-- El precio de venta por escalón sigue en productos_servicios.tarifas_capacidad;
-- el proveedor preferido copia su costo a esos escalones.

ALTER TABLE public.proveedor_productos
  ADD COLUMN IF NOT EXISTS tarifas_capacidad JSONB NOT NULL DEFAULT '[]'::jsonb;
