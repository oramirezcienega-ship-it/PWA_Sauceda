-- Migration 0028: Agregar campo de tipo de negocio a expedientes
-- ============================================================

ALTER TABLE public.expedientes
ADD COLUMN IF NOT EXISTS tipo_negocio TEXT NOT NULL DEFAULT 'traspaso_compra'
CONSTRAINT expedientes_tipo_negocio_check CHECK (tipo_negocio IN (
  'traspaso_compra',     -- Traspaso o compra de casa
  'promocion_venta',    -- Promoción de venta de casa
  'solo_tramite',       -- Solo trámite
  'construccion',       -- Sauceda Construye
  'otro'
));
