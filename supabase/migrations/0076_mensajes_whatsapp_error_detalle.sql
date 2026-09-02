-- Migración 0076: Diagnóstico de entrega y posible bloqueo en WhatsApp
-- Agrega columnas para registrar el código y descripción del error devuelto por Meta Cloud API

ALTER TABLE public.mensajes_whatsapp ADD COLUMN IF NOT EXISTS error_detalle TEXT;
ALTER TABLE public.mensajes_whatsapp ADD COLUMN IF NOT EXISTS error_codigo INTEGER;

COMMENT ON COLUMN public.mensajes_whatsapp.error_detalle IS 'Descripción amigable del motivo por el cual falló la entrega (ej. Ventana 24h cerrada, Destinatario no disponible, Posible bloqueo).';
COMMENT ON COLUMN public.mensajes_whatsapp.error_codigo IS 'Código numérico de error retornado por Meta Graph API (ej. 131047, 131026, 131051, 131048).';
