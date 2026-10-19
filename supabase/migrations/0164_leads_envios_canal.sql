-- Canal por el que se pasó el lead al asesor: Telegram (bot con botones de acuse)
-- o WhatsApp (desde el WhatsApp de quien lo envía, sin acuse automático).
ALTER TABLE public.leads_envios_telegram
  ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'telegram'
  CHECK (canal IN ('telegram', 'whatsapp'));
