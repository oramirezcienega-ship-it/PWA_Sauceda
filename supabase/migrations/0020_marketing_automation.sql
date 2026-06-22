-- ============================================================
-- MÓDULO: MARKETING AUTOMATION MULTICANAL (SECUENCIAS)
-- ------------------------------------------------------------
-- Tablas para crear secuencias automatizadas de contacto con delays,
-- asignación de tareas a asesores y trazabilidad de acciones.
-- ============================================================

-- 1. Secuencias de automatización
CREATE TABLE IF NOT EXISTS public.automation_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  status      TEXT DEFAULT 'activa' CHECK (status IN ('activa', 'pausada', 'archivada')),
  segmento    TEXT DEFAULT 'todos' CHECK (segmento IN ('sin_contactar', 'sin_respuesta', 'rojo', 'todos')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.automation_sequences ENABLE ROW LEVEL SECURITY;

-- 2. Pasos de cada secuencia
CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id      UUID REFERENCES public.automation_sequences(id) ON DELETE CASCADE,
  orden            INT NOT NULL,
  canal            TEXT NOT NULL CHECK (canal IN ('whatsapp', 'email', 'llamada', 'messenger', 'sms')),
  delay_horas      INT DEFAULT 0,
  mensaje          TEXT,
  asunto_email     TEXT,
  asignar_a        UUID REFERENCES public.perfiles(id) ON DELETE SET NULL, -- Relacionado con perfiles (usuarios)
  condicion_salida TEXT DEFAULT 'respondio' CHECK (condicion_salida IN ('respondio', 'califico', 'manual')),
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sequence_steps_sequence_idx ON public.sequence_steps(sequence_id);

-- 3. Enrollment de leads en secuencias
CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id        UUID REFERENCES public.automation_sequences(id) ON DELETE CASCADE,
  conversation_id    UUID, -- Se enlazará condicionalmente si existe la tabla public.conversations
  prospecto_id       TEXT REFERENCES public.prospectos(id) ON DELETE SET NULL, -- Soporte de fallback
  expediente_id      TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL, -- Soporte de fallback
  phone              TEXT,
  nombre             TEXT,
  email              TEXT,
  status             TEXT DEFAULT 'activo' CHECK (status IN ('activo', 'pausado', 'completado', 'salido')),
  step_actual        INT DEFAULT 1,
  enrolled_at        TIMESTAMPTZ DEFAULT now(),
  ultimo_contacto_at TIMESTAMPTZ,
  salio_en_step      INT,
  razon_salida       TEXT
);
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sequence_enrollments_sequence_idx ON public.sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS sequence_enrollments_phone_idx ON public.sequence_enrollments(phone);
CREATE INDEX IF NOT EXISTS sequence_enrollments_prospecto_idx ON public.sequence_enrollments(prospecto_id);

-- Enlace condicional con public.conversations si la tabla existe en el esquema estándar
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
    ALTER TABLE public.sequence_enrollments
      ADD CONSTRAINT fk_sequence_enrollments_conversation
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Trazabilidad de cada acción
CREATE TABLE IF NOT EXISTS public.sequence_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     UUID REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  step_id           UUID REFERENCES public.sequence_steps(id) ON DELETE SET NULL,
  canal             TEXT,
  status            TEXT CHECK (status IN ('enviado', 'entregado', 'fallido', 'respondido', 'llamada_agendada', 'llamada_completada', 'sms_enviado')),
  contenido_enviado TEXT,
  enviado_at        TIMESTAMPTZ DEFAULT now(),
  respondido_at     TIMESTAMPTZ,
  notas_asesor      TEXT,
  error_detalle     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sequence_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sequence_actions_enrollment_idx ON public.sequence_actions(enrollment_id);

-- 5. Tareas asignadas a asesores (bandeja de llamadas/seguimientos)
CREATE TABLE IF NOT EXISTS public.asesor_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  UUID REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  asesor_id      UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  tipo           TEXT CHECK (tipo IN ('llamada', 'seguimiento', 'visita')),
  status         TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'completada', 'reagendada', 'perdida')),
  agendada_para  TIMESTAMPTZ DEFAULT now(),
  completada_at  TIMESTAMPTZ,
  notas          TEXT,
  resultado      TEXT CHECK (resultado IN ('respondio', 'no_contesto', 'numero_invalido', 'agendo_cita')),
  created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.asesor_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS asesor_tasks_asesor_idx ON public.asesor_tasks(asesor_id);
CREATE INDEX IF NOT EXISTS asesor_tasks_status_idx ON public.asesor_tasks(status);
