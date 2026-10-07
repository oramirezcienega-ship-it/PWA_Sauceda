-- ============================================================
-- MIGRACIÓN 0133: Portal del asesor (link personal sin login)
-- ------------------------------------------------------------
-- Cada asesor tiene un link fijo /asesor/{token} para ver sus coordinaciones
-- de inspección y los clientes que se le compartieron, y dar retroalimentación
-- sin usuario ni contraseña. El token se puede regenerar desde el CRM.
-- ============================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS portal_token TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_perfiles_portal_token
  ON public.perfiles(portal_token) WHERE portal_token IS NOT NULL;

-- Historial de retroalimentación: cada respuesta es un renglón (se conserva todo)
CREATE TABLE IF NOT EXISTS public.retroalimentacion_asesor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('coordinacion', 'lead')),
  coordinacion_id UUID NULL REFERENCES public.coordinaciones_inspeccion(id) ON DELETE CASCADE,
  envio_lead_id UUID NULL REFERENCES public.leads_envios_telegram(id) ON DELETE CASCADE,
  -- coordinacion: realizada | no_realizada | reprogramar
  -- lead: contactado | no_contesta | cotizado | cerrado | no_interesa | no_puedo_atender
  estado TEXT NOT NULL,
  cliente_presente BOOLEAN NULL,
  siguiente_paso TEXT NOT NULL DEFAULT '',
  siguiente_paso_fecha DATE NULL,
  comentario TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_retro_referencia CHECK (
    (tipo = 'coordinacion' AND coordinacion_id IS NOT NULL) OR
    (tipo = 'lead' AND envio_lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_retro_asesor_coord ON public.retroalimentacion_asesor(coordinacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retro_asesor_lead ON public.retroalimentacion_asesor(envio_lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retro_asesor_asesor ON public.retroalimentacion_asesor(asesor_id, created_at DESC);

ALTER TABLE public.retroalimentacion_asesor ENABLE ROW LEVEL SECURITY;
-- Solo el servidor (service role) lee y escribe esta tabla.
