-- ============================================================
-- MIGRACIÓN 0109: Tracking de Campañas Mautic en WhatsApp
-- ------------------------------------------------------------
-- Agrega columnas para registrar:
-- 1. campana_origen: Nombre de la campaña (ej. "Reactivación 3 MSI")
-- 2. leido_at: Fecha/hora exacta en que el cliente abrió/leyó el mensaje (webhook read)
-- 3. entregado_at: Fecha/hora exacta de entrega al dispositivo del cliente (webhook delivered)
-- ============================================================

ALTER TABLE public.mensajes_whatsapp 
  ADD COLUMN IF NOT EXISTS leido_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS entregado_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS campana_origen TEXT NULL;

COMMENT ON COLUMN public.mensajes_whatsapp.campana_origen IS 'Nombre o identificador de la campaña de Mautic o automatización que originó el mensaje.';
COMMENT ON COLUMN public.mensajes_whatsapp.leido_at IS 'Fecha y hora exacta en que el destinatario abrió o leyó el mensaje en WhatsApp (estado read).';
COMMENT ON COLUMN public.mensajes_whatsapp.entregado_at IS 'Fecha y hora exacta en que el mensaje fue entregado al dispositivo del destinatario (estado delivered).';

-- Índices de consulta y rendimiento
CREATE INDEX IF NOT EXISTS idx_mensajes_whatsapp_campana ON public.mensajes_whatsapp (campana_origen);
CREATE INDEX IF NOT EXISTS idx_mensajes_whatsapp_leido ON public.mensajes_whatsapp (leido_at) WHERE leido_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mensajes_whatsapp_entregado ON public.mensajes_whatsapp (entregado_at) WHERE entregado_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
