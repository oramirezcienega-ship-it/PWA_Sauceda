-- Migration 0091: Cabina de Coordinación de Inspecciones y Validación Multi-Asesor
-- =================================================================================

CREATE TABLE IF NOT EXISTS public.coordinaciones_inspeccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id TEXT REFERENCES public.prospectos(id) ON DELETE CASCADE,
  expediente_id TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL,
  cita_id UUID REFERENCES public.agenda_citas(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  servicio_tipo TEXT NOT NULL,
  servicio_nombre TEXT NOT NULL,
  ubicacion TEXT NOT NULL,
  fraccionamiento TEXT,
  detalles_tecnicos TEXT,
  asesores_ids UUID[] NOT NULL DEFAULT '{}',
  opciones_horarios JSONB NOT NULL DEFAULT '[]', 
  respuestas_asesores JSONB NOT NULL DEFAULT '{}',
  opciones_validadas JSONB NOT NULL DEFAULT '[]',
  opcion_seleccionada_id TEXT,
  estado TEXT NOT NULL DEFAULT 'propuesta_enviada',
  sla_minutos INTEGER DEFAULT 15,
  sla_limite_at TIMESTAMPTZ,
  sla_estado TEXT DEFAULT 'en_tiempo',
  canal_notificacion TEXT DEFAULT 'whatsapp',
  creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coordinaciones_prospecto_id ON public.coordinaciones_inspeccion(prospecto_id);
CREATE INDEX IF NOT EXISTS idx_coordinaciones_estado ON public.coordinaciones_inspeccion(estado);
CREATE INDEX IF NOT EXISTS idx_coordinaciones_sla_limite ON public.coordinaciones_inspeccion(sla_limite_at) WHERE estado IN ('propuesta_enviada', 'evaluando');
