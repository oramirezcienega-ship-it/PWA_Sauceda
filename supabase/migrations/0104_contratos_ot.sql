-- ============================================================
-- Migración 0104: Contratos de prestación de servicios (por Orden de Trabajo)
-- ============================================================
-- Al crear una OT desde una cotización aceptada se genera un contrato
-- imprimible. El contrato se guarda como SNAPSHOT (datos_snapshot) para que
-- lo ya firmado no cambie aunque la cotización se edite después.

CREATE TABLE IF NOT EXISTS public.contratos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             TEXT NOT NULL,                       -- CTR-AAAA-####
  version           INT  NOT NULL DEFAULT 1,
  orden_trabajo_id  UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  cotizacion_id     TEXT REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  cliente_id        TEXT REFERENCES public.prospectos(id) ON DELETE SET NULL,
  tipo_servicio     TEXT NOT NULL DEFAULT 'general',
  estado            TEXT NOT NULL DEFAULT 'generado'
                      CHECK (estado IN ('borrador', 'generado', 'firmado', 'cancelado')),
  datos_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url           TEXT,                                -- reservado (PDF almacenado)
  pdf_firmado_url   TEXT,                                -- ruta en Storage (bucket privado "contratos")
  fecha_generacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_firma       DATE,
  generado_por      UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contratos_folio_version_uq UNIQUE (folio, version)
);

CREATE INDEX IF NOT EXISTS idx_contratos_ot ON public.contratos(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON public.contratos(estado);

-- Un solo contrato vigente (no cancelado) por orden de trabajo
CREATE UNIQUE INDEX IF NOT EXISTS contratos_ot_vigente_uq
  ON public.contratos(orden_trabajo_id) WHERE estado <> 'cancelado';

ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso completo a contratos para autenticados" ON public.contratos;
CREATE POLICY "Acceso completo a contratos para autenticados"
  ON public.contratos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Textos configurables (editables sin desplegar código)
CREATE TABLE IF NOT EXISTS public.plantillas_clausulas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servicio  TEXT NOT NULL,
  clave          TEXT NOT NULL,
  texto          TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plantillas_clausulas_uq UNIQUE (tipo_servicio, clave)
);

ALTER TABLE public.plantillas_clausulas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso completo a plantillas_clausulas para autenticados" ON public.plantillas_clausulas;
CREATE POLICY "Acceso completo a plantillas_clausulas para autenticados"
  ON public.plantillas_clausulas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket privado para contratos firmados (acceso solo con URL firmada)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos', 'contratos', false)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Datos semilla
-- ------------------------------------------------------------
-- Datos del prestador y valores por defecto (globales, tipo "general").
-- IMPORTANTE: capturar el RFC y el domicilio reales en la pantalla de configuración.
INSERT INTO public.plantillas_clausulas (tipo_servicio, clave, texto) VALUES
  ('general', 'prestador_razon_social', 'SAUCEDA Bienes Raíces & Construcción'),
  ('general', 'prestador_rfc', 'POR CAPTURAR'),
  ('general', 'prestador_domicilio', 'POR CAPTURAR'),
  ('general', 'anticipo_pct_default', '50'),
  ('general', 'duracion_dias_default', '5')
ON CONFLICT (tipo_servicio, clave) DO NOTHING;

-- Cláusulas por tipo de servicio
INSERT INTO public.plantillas_clausulas (tipo_servicio, clave, texto) VALUES
  -- Impermeabilización
  ('impermeabilizacion', 'clausula_clima', 'Los trabajos se suspenden en caso de lluvia o humedad en la superficie, sin penalización para ninguna de las partes; el plazo se recorre por los días de suspensión.'),
  ('impermeabilizacion', 'garantia_objeto', 'filtraciones en el área impermeabilizada atribuibles a la aplicación'),
  ('impermeabilizacion', 'garantia_exclusiones', 'perforaciones o instalaciones posteriores sobre la superficie; tránsito pesado o uso distinto a azotea; falta de mantenimiento; movimientos o fallas estructurales; daños causados por terceros o fenómenos naturales extraordinarios'),
  ('impermeabilizacion', 'exclusiones', 'reparaciones estructurales de losa; bajadas pluviales; retiro de impermeabilizante anterior salvo que se indique en el Anexo A; movimiento de tinacos, antenas o equipos'),
  ('impermeabilizacion', 'garantia_default', '3 años'),
  -- Herrería / techados
  ('herreria', 'clausula_clima', 'Las fechas pueden ajustarse por condiciones climáticas que impidan trabajar con seguridad.'),
  ('herreria', 'garantia_objeto', 'soldaduras, estructura y fijaciones'),
  ('herreria', 'garantia_exclusiones', 'golpes, sobrecarga, modificaciones de terceros, corrosión por falta de mantenimiento de pintura'),
  ('herreria', 'exclusiones', 'obra civil o albañilería no descrita; permisos municipales'),
  ('herreria', 'garantia_default', '1 año'),
  -- Cancelería de aluminio
  ('canceleria', 'clausula_clima', 'Las fechas pueden ajustarse por condiciones climáticas que impidan trabajar con seguridad.'),
  ('canceleria', 'garantia_objeto', 'herrajes, sellado y funcionamiento'),
  ('canceleria', 'garantia_exclusiones', 'rotura de vidrio por impacto; mal uso; modificaciones de terceros'),
  ('canceleria', 'exclusiones', 'trabajos de albañilería para ajustar vanos, salvo que se indique'),
  ('canceleria', 'garantia_default', '1 año'),
  -- Remodelación
  ('remodelacion', 'clausula_clima', 'Las fechas pueden ajustarse por condiciones climáticas que impidan trabajar con seguridad.'),
  ('remodelacion', 'garantia_objeto', 'mano de obra de los trabajos ejecutados'),
  ('remodelacion', 'garantia_exclusiones', 'materiales proporcionados por el Cliente; vicios ocultos preexistentes; modificaciones de terceros'),
  ('remodelacion', 'exclusiones', 'trámites y permisos; mobiliario; trabajos no descritos en el Anexo A'),
  ('remodelacion', 'garantia_default', '1 año'),
  -- Tinacos
  ('tinacos', 'clausula_clima', ''),
  ('tinacos', 'garantia_objeto', 'instalación y conexiones realizadas'),
  ('tinacos', 'garantia_exclusiones', 'fallas de la red municipal; presión de agua; daños por terceros'),
  ('tinacos', 'exclusiones', 'reparaciones de la red hidráulica existente fuera del punto de conexión'),
  ('tinacos', 'garantia_default', '1 año'),
  -- Cisternas
  ('cisternas', 'clausula_clima', ''),
  ('cisternas', 'garantia_objeto', 'instalación y conexiones realizadas'),
  ('cisternas', 'garantia_exclusiones', 'fallas de la red municipal; presión de agua; daños por terceros'),
  ('cisternas', 'exclusiones', 'reparaciones de la red hidráulica existente fuera del punto de conexión'),
  ('cisternas', 'garantia_default', '1 año'),
  -- Seguridad (cámaras, malla)
  ('seguridad', 'clausula_clima', ''),
  ('seguridad', 'garantia_objeto', 'instalación y configuración'),
  ('seguridad', 'garantia_exclusiones', 'garantía del equipo según el fabricante; daños eléctricos por variaciones de voltaje; manipulación de terceros'),
  ('seguridad', 'exclusiones', 'servicio de internet; mantenimiento posterior'),
  ('seguridad', 'garantia_default', '1 año'),
  -- General
  ('general', 'clausula_clima', ''),
  ('general', 'garantia_objeto', 'mano de obra de los trabajos ejecutados'),
  ('general', 'garantia_exclusiones', 'mal uso, modificaciones de terceros, falta de mantenimiento'),
  ('general', 'exclusiones', 'trabajos no descritos en el Anexo A'),
  ('general', 'garantia_default', '1 año')
ON CONFLICT (tipo_servicio, clave) DO NOTHING;
