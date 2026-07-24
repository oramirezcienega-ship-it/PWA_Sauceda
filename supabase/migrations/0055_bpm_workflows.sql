-- Migration 0055: Sistema de BPM y Flujos de Trabajo
-- ============================================================

-- 1. Tabla de Flujos por producto (tipo_negocio)
CREATE TABLE IF NOT EXISTS public.bpm_flujos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_negocio TEXT NOT NULL UNIQUE,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Pasos (tareas definidas para cada flujo)
CREATE TABLE IF NOT EXISTS public.bpm_pasos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flujo_id             UUID NOT NULL REFERENCES public.bpm_flujos(id) ON DELETE CASCADE,
  etapa                TEXT NOT NULL,
  orden                INTEGER NOT NULL DEFAULT 1,
  titulo_tarea         TEXT NOT NULL,
  descripcion          TEXT,
  rol_responsable      TEXT NOT NULL CHECK (rol_responsable IN ('asesor', 'operaciones', 'tecnico', 'admin')),
  dias_vencimiento     INTEGER NOT NULL DEFAULT 3,
  condicion_activacion TEXT NOT NULL DEFAULT 'inmediato',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla de Tareas Instanciadas en cada Expediente
CREATE TABLE IF NOT EXISTS public.bpm_expediente_tareas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id     TEXT NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  paso_id           UUID REFERENCES public.bpm_pasos(id) ON DELETE SET NULL,
  titulo            TEXT NOT NULL,
  descripcion       TEXT,
  estado            TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'esperando_condicion', 'completada', 'cancelada')),
  responsable_id    UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  dias_vencimiento  INTEGER NOT NULL DEFAULT 3,
  agendada_para     TIMESTAMPTZ,
  completada_en     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS bpm_pasos_flujo_id_idx ON public.bpm_pasos(flujo_id);
CREATE INDEX IF NOT EXISTS bpm_expediente_tareas_expediente_id_idx ON public.bpm_expediente_tareas(expediente_id);
CREATE INDEX IF NOT EXISTS bpm_expediente_tareas_estado_idx ON public.bpm_expediente_tareas(estado);

-- 5. Habilitar RLS
ALTER TABLE public.bpm_flujos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpm_pasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpm_expediente_tareas ENABLE ROW LEVEL SECURITY;

-- 6. Políticas de Seguridad (Acceso completo a usuarios autenticados)
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en flujos" ON public.bpm_flujos;
CREATE POLICY "Permitir todo a usuarios autenticados en flujos" ON public.bpm_flujos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en pasos" ON public.bpm_pasos;
CREATE POLICY "Permitir todo a usuarios autenticados en pasos" ON public.bpm_pasos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en tareas expedientes" ON public.bpm_expediente_tareas;
CREATE POLICY "Permitir todo a usuarios autenticados en tareas expedientes" ON public.bpm_expediente_tareas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
