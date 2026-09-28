-- ============================================================
-- Migración 0094: Vincular Remisiones y Facturas con Órdenes de Trabajo
-- ============================================================

ALTER TABLE public.remisiones_facturas
  ADD COLUMN IF NOT EXISTS orden_trabajo_id UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_remisiones_facturas_ot ON public.remisiones_facturas(orden_trabajo_id);
