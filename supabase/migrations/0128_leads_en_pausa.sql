-- ============================================================================
-- Leads en pausa ("retomar después")
-- Cuando el cliente pospone ("hasta diciembre", "ahorita no, en enero"), el
-- negocio pasa a la etapa 'en_pausa' con una fecha para retomarlo. Mientras
-- está en pausa no recibe campañas, retoques ni secuencias. Al llegar la
-- fecha, el cron lo regresa a su etapa previa, crea tareas para el asesor y
-- los administradores y envía una plantilla aprobada de WhatsApp.
-- ============================================================================

-- 1. Datos de la pausa en el expediente
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS retomar_en   DATE,
  ADD COLUMN IF NOT EXISTS motivo_pausa TEXT,
  ADD COLUMN IF NOT EXISTS etapa_previa TEXT,
  ADD COLUMN IF NOT EXISTS pausado_en   TIMESTAMPTZ;

COMMENT ON COLUMN public.expedientes.retomar_en IS 'Fecha en que el negocio en pausa se reactiva automáticamente.';
COMMENT ON COLUMN public.expedientes.motivo_pausa IS 'Motivo por el que el cliente pospuso (lo que dijo).';
COMMENT ON COLUMN public.expedientes.etapa_previa IS 'Etapa a la que regresa el negocio al despertar.';

CREATE INDEX IF NOT EXISTS expedientes_retomar_en_idx
  ON public.expedientes (retomar_en)
  WHERE etapa = 'en_pausa';

-- 2. Nueva etapa 'en_pausa'
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_etapa_check;
ALTER TABLE public.expedientes
  ADD CONSTRAINT expedientes_etapa_check
  CHECK (etapa IN (
    'nuevo-lead', 'contactado', 'visita', 'inspeccion_programada', 'valuacion', 'oferta',
    'documentos', 'notaria', 'cerrado', 'perdido', 'interes', 'cotizacion', 'propuesta-aceptada', 'venta',
    'fuera_de_zona', 'en_pausa'
  ));

-- 3. Cotizaciones pausadas (no cuentan en el embudo activo ni en seguimientos)
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS estatus_previo TEXT;

ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_estatus_check;
ALTER TABLE public.cotizaciones ADD CONSTRAINT cotizaciones_estatus_check CHECK (estatus IN (
  'borrador', 'esperando_visita', 'en_inspeccion', 'calculando_costo',
  'pendiente_aprobacion', 'aprobada', 'enviada', 'aceptada', 'instalacion', 'rechazada', 'archivada',
  'pausada'
));

-- 4. Configuración del despertar (editable sin desplegar código)
--    plantilla_retomar_pausa: nombre de la plantilla aprobada en Meta.
--      Parámetros: {{1}} primer nombre del cliente, {{2}} servicio (ej. "impermeabilización").
--      Vacío = no se envía plantilla (solo tareas y avisos).
--    dias_anticipacion_retomar: días antes de la fecha que dijo el cliente.
INSERT INTO public.configuracion_agente (clave, valor) VALUES
  ('plantilla_retomar_pausa', 'retomar_proyecto_pausa'),
  ('dias_anticipacion_retomar', '7')
ON CONFLICT (clave) DO NOTHING;
