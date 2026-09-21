-- Migration 0080: Control de alertas y resúmenes de WhatsApp para la agenda
-- =========================================================================

-- 1. Agregar marcas de tiempo para evitar duplicidad en alertas previas de 2h y 1h
ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS alerta_2h_enviada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerta_1h_enviada_at TIMESTAMPTZ;

-- Índices para búsqueda rápida en el cron de citas de hoy pendientes de alerta
CREATE INDEX IF NOT EXISTS agenda_citas_alerta_2h_idx ON public.agenda_citas(fecha, alerta_2h_enviada_at) WHERE estado != 'cancelada';
CREATE INDEX IF NOT EXISTS agenda_citas_alerta_1h_idx ON public.agenda_citas(fecha, alerta_1h_enviada_at) WHERE estado != 'cancelada';

-- 2. Preferencias de notificación en perfiles de asesores y administradores
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS notificar_whatsapp_resumen_matutino BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notificar_whatsapp_resumen_nocturno BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notificar_whatsapp_alertas_previas BOOLEAN DEFAULT TRUE;
