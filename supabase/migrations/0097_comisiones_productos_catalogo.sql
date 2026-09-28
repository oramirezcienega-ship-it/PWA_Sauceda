-- ============================================================
-- Migración 0097: Comisión por producto en catálogo de conceptos
-- ============================================================

ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS porcentaje_comision NUMERIC(5, 2) NOT NULL DEFAULT 5.00;
