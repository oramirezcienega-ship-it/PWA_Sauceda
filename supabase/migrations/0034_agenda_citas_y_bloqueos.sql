-- Migration 0034: Sistema de Agenda, Citas y Bloqueos
-- ============================================================

-- 1. Agregar columnas a public.perfiles
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS horarios_agenda JSONB NOT NULL DEFAULT '{
    "lunes": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "martes": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "miercoles": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "jueves": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "viernes": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "sabado": [],
    "domingo": []
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS duracion_cita INTEGER NOT NULL DEFAULT 60;

-- 2. Crear tabla de bloqueos de agenda
CREATE TABLE IF NOT EXISTS public.agenda_bloqueos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  fecha       DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Crear tabla de citas agendadas
CREATE TABLE IF NOT EXISTS public.agenda_citas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id        UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  prospecto_id     UUID REFERENCES public.prospectos(id) ON DELETE SET NULL,
  cliente_nombre   TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  cliente_email    TEXT,
  tipo_cita        TEXT NOT NULL CHECK (tipo_cita IN ('venta', 'asesoria')),
  fecha            DATE NOT NULL,
  hora_inicio      TIME NOT NULL,
  hora_fin         TIME NOT NULL,
  notas            TEXT,
  estado           TEXT NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('pendiente', 'confirmada', 'cancelada')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Índices para agilizar consultas
CREATE INDEX IF NOT EXISTS agenda_bloqueos_perfil_fecha_idx ON public.agenda_bloqueos(perfil_id, fecha);
CREATE INDEX IF NOT EXISTS agenda_citas_perfil_fecha_idx ON public.agenda_citas(perfil_id, fecha);
CREATE INDEX IF NOT EXISTS agenda_citas_prospecto_idx ON public.agenda_citas(prospecto_id);

-- 5. Habilitar RLS (Row Level Security)
ALTER TABLE public.agenda_bloqueos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_citas ENABLE ROW LEVEL SECURITY;
