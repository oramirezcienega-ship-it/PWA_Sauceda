-- Migration 0092: Soporte para Notificaciones y Botones Interactivos de Telegram
-- ==============================================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

ALTER TABLE public.coordinaciones_inspeccion
  ADD COLUMN IF NOT EXISTS canal_notificacion TEXT DEFAULT 'telegram';

-- Índice para búsqueda rápida por telegram_chat_id
CREATE INDEX IF NOT EXISTS idx_perfiles_telegram_chat_id ON public.perfiles(telegram_chat_id);
