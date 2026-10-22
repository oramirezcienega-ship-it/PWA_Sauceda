-- Retroalimentación de asesores por WhatsApp (texto o audio dictado al número de la empresa).
-- El asesor escribe "RETRO" y durante un rato lo que mande se interpreta como retro de sus clientes.
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS retro_whatsapp_hasta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retro_whatsapp_ultimo_msg TEXT;

-- De dónde vino la retro: portal del asesor o WhatsApp.
ALTER TABLE public.retroalimentacion_asesor
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'portal'
  CHECK (origen IN ('portal', 'whatsapp'));
