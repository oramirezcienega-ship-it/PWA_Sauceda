-- Migration 0090: Motor Universal de Coordinación de Inspecciones y SLA
-- ===========================================================================

-- 1. Soporte de asignación múltiple de perfiles en citas
ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS asignados_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS agenda_citas_asignados_ids_gin ON public.agenda_citas USING GIN(asignados_ids);

-- 2. Campos para control y seguimiento de SLA
ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS sla_limite_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_estado TEXT DEFAULT 'en_tiempo',
  ADD COLUMN IF NOT EXISTS confirmaciones_equipo JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS servicio_tipo TEXT,
  ADD COLUMN IF NOT EXISTS canal_notificacion TEXT DEFAULT 'whatsapp';

-- 3. Índices para consultas ágiles de SLA en tiempo real
CREATE INDEX IF NOT EXISTS idx_agenda_citas_sla_estado ON public.agenda_citas(sla_estado);
CREATE INDEX IF NOT EXISTS idx_agenda_citas_sla_limite ON public.agenda_citas(sla_limite_at) WHERE estado = 'pendiente';
