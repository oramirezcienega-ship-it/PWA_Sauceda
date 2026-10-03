-- ============================================================
-- MIGRACIÓN 0126: Control de Campañas Mautic & Enrolamiento desde CRM
-- ------------------------------------------------------------
-- Permite al equipo comercial y operativo ver y gestionar en qué
-- campañas de Mautic / automatizaciones está inscrito un Prospecto o Expediente.
-- ============================================================

-- 1. Tabla de Catálogo de Campañas Mautic
CREATE TABLE IF NOT EXISTS public.mautic_campanas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT NULL,
  canal TEXT NOT NULL DEFAULT 'omnicanal',
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Enrolamientos de Prospectos / Expedientes en Campañas
CREATE TABLE IF NOT EXISTS public.mautic_enrolamientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id TEXT NOT NULL REFERENCES public.mautic_campanas(id) ON UPDATE CASCADE ON DELETE CASCADE,
  prospecto_id TEXT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  expediente_id TEXT NULL REFERENCES public.expedientes(id) ON DELETE SET NULL,
  telefono TEXT NOT NULL DEFAULT '',
  correo TEXT NOT NULL DEFAULT '',
  nombre_contacto TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'desuscrito', 'completado', 'pausado')),
  origen_alta TEXT NOT NULL DEFAULT 'crm_manual' CHECK (origen_alta IN ('crm_manual', 'mautic_sync', 'webhook', 'automatizacion')),
  enrolado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  desuscrito_at TIMESTAMPTZ NULL,
  notas TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_mautic_enrol_prospecto ON public.mautic_enrolamientos(prospecto_id);
CREATE INDEX IF NOT EXISTS idx_mautic_enrol_expediente ON public.mautic_enrolamientos(expediente_id);
CREATE INDEX IF NOT EXISTS idx_mautic_enrol_telefono ON public.mautic_enrolamientos(telefono);
CREATE INDEX IF NOT EXISTS idx_mautic_enrol_estado ON public.mautic_enrolamientos(estado);
CREATE INDEX IF NOT EXISTS idx_mautic_enrol_campana ON public.mautic_enrolamientos(campana_id);

-- Evitar duplicar una misma inscripción activa para el mismo prospecto o teléfono
CREATE UNIQUE INDEX IF NOT EXISTS idx_mautic_enrol_unico 
  ON public.mautic_enrolamientos(campana_id, COALESCE(prospecto_id, ''), COALESCE(telefono, '')) 
  WHERE estado = 'activo';

-- 4. Seguridad RLS
ALTER TABLE public.mautic_campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mautic_enrolamientos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mautic_campanas' AND policyname = 'Permitir lectura mautic_campanas'
  ) THEN
    CREATE POLICY "Permitir lectura mautic_campanas" ON public.mautic_campanas FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mautic_campanas' AND policyname = 'Permitir todo mautic_campanas a autenticados'
  ) THEN
    CREATE POLICY "Permitir todo mautic_campanas a autenticados" ON public.mautic_campanas FOR ALL USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mautic_enrolamientos' AND policyname = 'Permitir lectura mautic_enrolamientos'
  ) THEN
    CREATE POLICY "Permitir lectura mautic_enrolamientos" ON public.mautic_enrolamientos FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mautic_enrolamientos' AND policyname = 'Permitir todo mautic_enrolamientos a autenticados'
  ) THEN
    CREATE POLICY "Permitir todo mautic_enrolamientos a autenticados" ON public.mautic_enrolamientos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 5. Semilla inicial de Campañas Mautic habituales
INSERT INTO public.mautic_campanas (id, nombre, descripcion, canal, activa) VALUES
  ('1', 'Reactivación 3 MSI', 'Campaña de difusión para prospectos fríos ofreciendo impermeabilización a 3 meses sin intereses.', 'whatsapp', true),
  ('2', 'Nutrición Post-Inspección', 'Seguimiento y contenido de valor tras realizar la inspección técnica.', 'omnicanal', true),
  ('3', 'Seguimiento Cotización Impermeabilización', 'Recordatorio de presupuesto pendiente y facilidades de pago con tarjeta.', 'whatsapp', true),
  ('4', 'Boletín Informativo Sauceda', 'Newsletter mensual con consejos de mantenimiento, impermeabilización y obras.', 'email', true),
  ('5', 'Garantías y Post-Venta', 'Encuesta de calidad y seguimiento posterior al finiquito de obra.', 'whatsapp', true)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  canal = EXCLUDED.canal,
  activa = EXCLUDED.activa;

NOTIFY pgrst, 'reload schema';
