-- Migration 0109: Autorización de costos de una cotización por Telegram
-- =========================================================================
-- Proveedores vinculables al bot de Telegram y bitácora de envíos/respuestas
-- de autorización de costo por cotización.

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- { "<prov|perf>:<id>": { nombre, tipo, ok, enviadoAt, error?, respuesta: 'autorizado'|'rechazado'|null, respondidoAt } }
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS autorizacion_costos JSONB NOT NULL DEFAULT '{}'::jsonb;
