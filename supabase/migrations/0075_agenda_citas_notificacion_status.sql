-- Migration 0075: Campos para seguimiento de confirmación por WhatsApp y Correo en agenda_citas
-- ==============================================================================================

-- 1. Agregar columnas para tracking de mensaje de WhatsApp y Correo
ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS mensaje_whatsapp_estado TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS email_enviado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_destinatario TEXT;

-- 2. Crear índice para agilizar la búsqueda y actualización desde el webhook de WhatsApp
CREATE INDEX IF NOT EXISTS agenda_citas_wa_message_id_idx ON public.agenda_citas(wa_message_id);
