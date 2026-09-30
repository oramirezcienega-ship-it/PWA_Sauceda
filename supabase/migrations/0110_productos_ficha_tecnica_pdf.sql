-- Migration 0110: Ficha técnica en PDF por producto/servicio
-- =========================================================================
-- Sofía la envía por WhatsApp sólo cuando el cliente la solicita, según el
-- producto que eligió.

ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS ficha_tecnica_url TEXT,
  ADD COLUMN IF NOT EXISTS ficha_tecnica_nombre TEXT;
