-- Migration 0143: Asesoría de compra — precalificación como filtro y zonas en el mapa
-- ============================================================
-- 1. Catálogo editable de requisitos de precalificación por tipo de crédito.
-- 2. Ficha de la OT: respuestas a los requisitos, evidencias, dictamen
--    (apto / apto con condiciones / no apto → en pausa con fecha para retomar),
--    zonas confirmadas en Google Maps y expectativas del comprador.
-- 3. Bucket privado `precalificaciones` para las evidencias.
-- Solo agrega: no cambia flujos existentes.
-- ============================================================

-- 1. Requisitos por tipo de crédito ------------------------------------------
CREATE TABLE IF NOT EXISTS public.requisitos_precalificacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_credito   text NOT NULL CHECK (tipo_credito IN ('infonavit','fovissste','bancario','cofinavit','contado')),
  clave          text NOT NULL,
  etiqueta       text NOT NULL,
  ayuda          text NOT NULL DEFAULT '',
  -- si_no: cumple si es "sí"; numero: cumple si ≥ minimo (sin mínimo, basta capturarlo); texto: basta capturarlo
  tipo_respuesta text NOT NULL DEFAULT 'si_no' CHECK (tipo_respuesta IN ('si_no','numero','texto')),
  minimo         numeric,
  obligatorio    boolean NOT NULL DEFAULT true,
  orden          int NOT NULL DEFAULT 0,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_credito, clave)
);

COMMENT ON TABLE public.requisitos_precalificacion IS
  'Requisitos que debe cumplir el comprador, por tipo de crédito, antes de iniciar la búsqueda de casa. Editable desde configuración.';

ALTER TABLE public.requisitos_precalificacion ENABLE ROW LEVEL SECURITY;
DO $p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requisitos_precalificacion'
                 AND policyname = 'Admins full access requisitos_precalificacion') THEN
    CREATE POLICY "Admins full access requisitos_precalificacion" ON public.requisitos_precalificacion
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$p$;

-- Base inicial (ajustable): los mínimos cambian seguido, confírmalos.
INSERT INTO public.requisitos_precalificacion (tipo_credito, clave, etiqueta, ayuda, tipo_respuesta, minimo, orden) VALUES
  ('infonavit', 'relacion_laboral', 'Relación laboral vigente (cotizando al IMSS)', 'Que esté dado de alta con su patrón actual.', 'si_no', NULL, 1),
  ('infonavit', 'puntos', 'Puntos Infonavit', 'Puntaje de Mi Cuenta Infonavit. Ajusta el mínimo si cambia la regla.', 'numero', 1080, 2),
  ('infonavit', 'sin_credito_activo', 'Sin crédito Infonavit activo', 'Si ya tiene uno vigente no puede tramitar otro tradicional.', 'si_no', NULL, 3),
  ('infonavit', 'precalificacion_vigente', 'Precalificación de Mi Cuenta Infonavit vigente', 'Sube la impresión o captura como evidencia.', 'si_no', NULL, 4),
  ('infonavit', 'buro_sin_atrasos', 'Buró de crédito sin atrasos graves', 'Revisión de historial (aplica sobre todo si se combina con banco).', 'si_no', NULL, 5),

  ('fovissste', 'plaza_vigente', 'Trabajador del Estado con plaza vigente', 'Cotizando al ISSSTE.', 'si_no', NULL, 1),
  ('fovissste', 'sin_credito_activo', 'Sin crédito FOVISSSTE activo', '', 'si_no', NULL, 2),
  ('fovissste', 'precalificacion_vigente', 'Precalificación o registro FOVISSSTE vigente', 'Sube el comprobante como evidencia.', 'si_no', NULL, 3),

  ('bancario', 'score_buro', 'Score de Buró de Crédito', 'Cada banco pide su propio mínimo; anótalo en la nota del dictamen si aplica.', 'numero', NULL, 1),
  ('bancario', 'buro_sin_atrasos', 'Buró sin atrasos ni claves negativas', '', 'si_no', NULL, 2),
  ('bancario', 'ingresos_comprobables', 'Ingresos comprobables (nómina, estados de cuenta o declaraciones)', '', 'si_no', NULL, 3),
  ('bancario', 'antiguedad_laboral', 'Antigüedad laboral que pide el banco', 'Normalmente de 1 a 2 años en el empleo o actividad.', 'si_no', NULL, 4),
  ('bancario', 'capacidad_pago', 'Mensualidad estimada dentro de su capacidad de pago', 'Regla práctica: no más de 30–35 % del ingreso neto.', 'si_no', NULL, 5),
  ('bancario', 'enganche', 'Enganche y gastos de escrituración disponibles', 'Normalmente 10 % de enganche + 5–7 % de gastos.', 'si_no', NULL, 6),

  ('cofinavit', 'relacion_laboral', 'Relación laboral vigente (cotizando al IMSS)', '', 'si_no', NULL, 1),
  ('cofinavit', 'sin_credito_activo', 'Sin crédito Infonavit activo', '', 'si_no', NULL, 2),
  ('cofinavit', 'buro_sin_atrasos', 'Buró sin atrasos ni claves negativas', 'El banco revisa el historial.', 'si_no', NULL, 3),
  ('cofinavit', 'ingresos_comprobables', 'Ingresos comprobables', '', 'si_no', NULL, 4),
  ('cofinavit', 'capacidad_pago', 'Mensualidad estimada dentro de su capacidad de pago', 'Regla práctica: no más de 30–35 % del ingreso neto.', 'si_no', NULL, 5),

  ('contado', 'recursos_disponibles', 'Recursos disponibles para la operación', '', 'si_no', NULL, 1),
  ('contado', 'origen_comprobable', 'Origen de los recursos comprobable', 'Lo pide la notaría (prevención de lavado de dinero).', 'si_no', NULL, 2)
ON CONFLICT (tipo_credito, clave) DO NOTHING;

-- 2. Ficha de la OT ------------------------------------------------------------
ALTER TABLE public.ot_ficha_asesoria_compra
  ADD COLUMN IF NOT EXISTS precalificacion_respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS precalificacion_evidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dictamen text,
  ADD COLUMN IF NOT EXISTS dictamen_nota text,
  ADD COLUMN IF NOT EXISTS dictamen_en timestamptz,
  ADD COLUMN IF NOT EXISTS dictamen_por uuid,
  ADD COLUMN IF NOT EXISTS dictamen_retomar_el date,
  ADD COLUMN IF NOT EXISTS zonas_geo jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tipo_inmueble text,
  ADD COLUMN IF NOT EXISTS plazo_mudanza text,
  ADD COLUMN IF NOT EXISTS busqueda_indispensables text,
  ADD COLUMN IF NOT EXISTS justificacion_precio text;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ot_ficha_asesoria_compra_dictamen_check') THEN
    ALTER TABLE public.ot_ficha_asesoria_compra ADD CONSTRAINT ot_ficha_asesoria_compra_dictamen_check
      CHECK (dictamen IS NULL OR dictamen IN ('apto','apto_condiciones','no_apto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ot_ficha_asesoria_compra_tipo_inmueble_check') THEN
    ALTER TABLE public.ot_ficha_asesoria_compra ADD CONSTRAINT ot_ficha_asesoria_compra_tipo_inmueble_check
      CHECK (tipo_inmueble IS NULL OR tipo_inmueble IN ('casa','departamento','cualquiera'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ot_ficha_asesoria_compra_plazo_check') THEN
    ALTER TABLE public.ot_ficha_asesoria_compra ADD CONSTRAINT ot_ficha_asesoria_compra_plazo_check
      CHECK (plazo_mudanza IS NULL OR plazo_mudanza IN ('inmediato','1_3_meses','3_6_meses','mas_6_meses'));
  END IF;
END
$c$;

COMMENT ON COLUMN public.ot_ficha_asesoria_compra.zonas_geo IS
  'Zonas confirmadas en Google Maps: [{nombre, placeId, lat, lng, direccion, radioKm}]. busqueda_zonas guarda solo los nombres.';
COMMENT ON COLUMN public.ot_ficha_asesoria_compra.dictamen IS
  'Resultado de la precalificación: apto, apto_condiciones o no_apto (la OT queda en pausa hasta dictamen_retomar_el).';

-- 3. Bucket privado de evidencias ---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('precalificaciones', 'precalificaciones', false, 10485760,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO NOTHING;
