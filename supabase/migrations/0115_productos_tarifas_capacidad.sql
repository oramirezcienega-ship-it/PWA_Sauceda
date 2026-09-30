-- Migration 0115: Tarifas por capacidad (litros) en productos/servicios
-- ============================================================
-- Arreglo JSON [{ "hasta_litros": 1100, "precio": 3200 }, ...] para servicios cuyo
-- precio depende de la capacidad (limpieza de tinacos, mantenimiento de cisternas).
-- Sofía cotiza el escalón que corresponde a los litros que indica el cliente.

ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS tarifas_capacidad JSONB NOT NULL DEFAULT '[]'::jsonb;
