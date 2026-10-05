-- ============================================================
-- MIGRACIÓN 0127: Envío de leads a asesores por Telegram
-- ------------------------------------------------------------
-- Desde Conversaciones se le pasa un lead a un asesor: se le asigna, se
-- pausa a Sofía y se le envía por Telegram la ficha, un resumen, la
-- conversación (TXT) y las fotos del cliente. Aquí queda el registro del
-- envío y de la confirmación ("Recibido") o rechazo del asesor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leads_envios_telegram (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono TEXT NOT NULL,
  prospecto_id TEXT NULL REFERENCES public.prospectos(id) ON DELETE SET NULL,
  expediente_id TEXT NULL REFERENCES public.expedientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL DEFAULT '',
  asesor_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  asesor_nombre TEXT NOT NULL DEFAULT '',
  enviado_por_id UUID NULL REFERENCES public.perfiles(id) ON DELETE SET NULL,
  enviado_por_nombre TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  resumen TEXT NOT NULL DEFAULT '',
  telegram_message_id BIGINT NULL,
  fotos_enviadas INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado', 'revisado', 'rechazado')),
  respondido_at TIMESTAMPTZ NULL,
  respondido_via TEXT NULL CHECK (respondido_via IN ('telegram', 'manual')),
  recordatorio_at TIMESTAMPTZ NULL,
  actividad_id UUID NULL REFERENCES public.actividades(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_tg_telefono ON public.leads_envios_telegram(telefono, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tg_pendientes ON public.leads_envios_telegram(estado, created_at) WHERE estado = 'enviado';

ALTER TABLE public.leads_envios_telegram ENABLE ROW LEVEL SECURITY;
-- Solo el servidor (service role) lee y escribe esta tabla.
