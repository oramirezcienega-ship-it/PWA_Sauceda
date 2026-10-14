-- Migration 0141: La asesoría de compra vive en la ORDEN DE TRABAJO, no en el expediente
-- ============================================================
-- El expediente vuelve a tener solo la información básica del negocio con el
-- prospecto. Cuando se detona la operación se inicia una orden de trabajo
-- (ligada al expediente y al prospecto) y ella carga:
--   · sus etapas propias          → catálogo `ot_etapas` (por tipo de OT)
--   · su ficha particular         → `ot_ficha_asesoria_compra` (1:1 con la OT)
--   · sus tareas del flujo BPM    → `bpm_expediente_tareas.orden_trabajo_id`
--   · opciones, búsquedas, cierre → `orden_trabajo_id` en propuestas y búsquedas
-- Las OT de construcción no cambian: no tienen etapa ni ficha (opción A).
-- ============================================================

-- 1. Etapa de la OT (solo para tipos con catálogo en ot_etapas) ---------------
ALTER TABLE public.ordenes_trabajo ADD COLUMN IF NOT EXISTS etapa text;
COMMENT ON COLUMN public.ordenes_trabajo.etapa IS
  'Etapa del proceso propio del tipo de OT (catálogo ot_etapas). NULL en los tipos que solo usan estatus.';

-- 2. Catálogo de etapas por tipo de OT -----------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_etapas (
  tipo_negocio        text NOT NULL,
  clave               text NOT NULL,
  nombre              text NOT NULL,
  nombre_cliente      text NOT NULL,
  descripcion_cliente text NOT NULL DEFAULT '',
  orden               int  NOT NULL,
  -- Condición sobre la ficha para que la etapa aplique (mismo formato que bpm_pasos.condicion_campo)
  condicion_campo     jsonb,
  -- Al llegar aquí la OT queda completada
  es_final            boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tipo_negocio, clave)
);

ALTER TABLE public.ot_etapas ENABLE ROW LEVEL SECURITY;
DO $p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ot_etapas'
                 AND policyname = 'Admins full access ot_etapas') THEN
    CREATE POLICY "Admins full access ot_etapas" ON public.ot_etapas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$p$;

INSERT INTO public.ot_etapas (tipo_negocio, clave, nombre, nombre_cliente, descripcion_cliente, orden, condicion_campo, es_final) VALUES
  ('asesoria_compra', 'precalificacion', 'Precalificación', 'Precalificación',
   'Estamos revisando cuánto crédito te autorizan para saber tu poder de compra.', 1, NULL, false),
  ('asesoria_compra', 'busqueda', 'Búsqueda', 'Buscando tu casa',
   'Estamos buscando casas que se ajusten a tu perfil. Revisa tus opciones en este portal.', 2,
   '{"campo":"ya_tiene_casa","igual":false}', false),
  ('asesoria_compra', 'negociacion', 'Negociación', 'Negociación',
   'Estamos negociando la casa que elegiste.', 3, '{"campo":"ya_tiene_casa","igual":false}', false),
  ('asesoria_compra', 'expediente', 'Expediente del trámite', 'Integración de expediente',
   'Estamos reuniendo los documentos y el avalúo para tu crédito.', 4, NULL, false),
  ('asesoria_compra', 'escrituracion', 'Escrituración', 'Escrituración',
   'Estamos coordinando con la notaría la fecha de firma de tu escritura.', 5, NULL, false),
  ('asesoria_compra', 'entrega', 'Entrega', 'Entrega',
   '¡Ya casi! Preparamos la entrega de llaves y de tu testimonio.', 6, NULL, false),
  ('asesoria_compra', 'cerrada', 'Cerrada', 'Concluido',
   '¡Felicidades por tu nueva casa! Gracias por confiar en SAUCEDA.', 7, NULL, true)
ON CONFLICT (tipo_negocio, clave) DO NOTHING;

-- 3. Ficha de la OT de asesoría de compra (1:1) --------------------------------
CREATE TABLE IF NOT EXISTS public.ot_ficha_asesoria_compra (
  orden_trabajo_id            uuid PRIMARY KEY REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  ya_tiene_casa               boolean NOT NULL DEFAULT false,
  tipo_credito                text,
  monto_credito_precalificado numeric,
  monto_ahorro_propio         numeric,
  precalificacion_fecha       date,
  precalificacion_fuente      text CHECK (precalificacion_fuente IS NULL OR precalificacion_fuente IN ('infonavit','fovissste','bancario','cofinavit','otro')),
  busqueda_zonas              text[],
  busqueda_precio_min         numeric,
  busqueda_precio_max         numeric,
  busqueda_recamaras_min      int,
  busqueda_requisitos         text,
  precio_compraventa          numeric,
  fecha_escritura             date,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz
);

COMMENT ON TABLE public.ot_ficha_asesoria_compra IS
  'Información particular de una OT de asesoría de compra: precalificación, perfil de búsqueda y cierre.';

ALTER TABLE public.ot_ficha_asesoria_compra ENABLE ROW LEVEL SECURITY;
DO $p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ot_ficha_asesoria_compra'
                 AND policyname = 'Admins full access ot_ficha_asesoria_compra') THEN
    CREATE POLICY "Admins full access ot_ficha_asesoria_compra" ON public.ot_ficha_asesoria_compra
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$p$;

CREATE OR REPLACE TRIGGER ot_ficha_asesoria_compra_updated_at BEFORE UPDATE ON public.ot_ficha_asesoria_compra
  FOR EACH ROW EXECUTE FUNCTION public.inmuebles_touch_updated_at();

-- 4. Flujo BPM a nivel orden de trabajo ----------------------------------------
ALTER TABLE public.bpm_flujos ADD COLUMN IF NOT EXISTS ambito text NOT NULL DEFAULT 'expediente';
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bpm_flujos_ambito_check') THEN
    ALTER TABLE public.bpm_flujos ADD CONSTRAINT bpm_flujos_ambito_check CHECK (ambito IN ('expediente', 'orden_trabajo'));
  END IF;
END
$c$;
COMMENT ON COLUMN public.bpm_flujos.ambito IS
  'expediente = tareas al crear el expediente (comportamiento original); orden_trabajo = tareas al iniciar una OT de ese tipo.';

UPDATE public.bpm_flujos SET ambito = 'orden_trabajo' WHERE tipo_negocio = 'asesoria_compra';
-- El primer paso ya no es captación (eso vive en el expediente): arranca la OT.
UPDATE public.bpm_pasos SET etapa = 'precalificacion'
WHERE etapa = 'captacion'
  AND flujo_id IN (SELECT id FROM public.bpm_flujos WHERE tipo_negocio = 'asesoria_compra');

-- El flujo `solo_tramite` de la 0136 sobra: el cliente que ya tiene casa es una
-- OT de asesoría de compra con `ya_tiene_casa = true`. Se desactiva (sin borrarlo)
-- para que los expedientes de solo trámite no generen tareas, como antes de 0136.
UPDATE public.bpm_flujos SET activo = false, ambito = 'orden_trabajo' WHERE tipo_negocio = 'solo_tramite';

ALTER TABLE public.bpm_expediente_tareas
  ADD COLUMN IF NOT EXISTS orden_trabajo_id uuid REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS bpm_expediente_tareas_orden_idx
  ON public.bpm_expediente_tareas(orden_trabajo_id) WHERE orden_trabajo_id IS NOT NULL;

-- 5. Opciones y búsquedas cuelgan de la OT -------------------------------------
-- (ambas tablas están vacías en producción)
ALTER TABLE public.propuestas_inmuebles
  ADD COLUMN IF NOT EXISTS orden_trabajo_id uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE;
DO $u$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'propuestas_inmuebles_orden_inmueble_key') THEN
    ALTER TABLE public.propuestas_inmuebles ADD CONSTRAINT propuestas_inmuebles_orden_inmueble_key UNIQUE (orden_trabajo_id, inmueble_id);
  END IF;
END
$u$;
CREATE INDEX IF NOT EXISTS propuestas_inmuebles_orden_idx ON public.propuestas_inmuebles(orden_trabajo_id);

ALTER TABLE public.busquedas_aliados
  ADD COLUMN IF NOT EXISTS orden_trabajo_id uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS busquedas_aliados_orden_idx ON public.busquedas_aliados(orden_trabajo_id);

-- 6. KPIs por OT (la vista anterior leía columnas del expediente) --------------
-- Mismas columnas que la vista anterior (CREATE OR REPLACE) + orden_trabajo_id y folio al final.
CREATE OR REPLACE VIEW public.v_asesoria_compra_kpis WITH (security_invoker = true) AS
WITH props AS (
  SELECT
    p.orden_trabajo_id,
    count(*) FILTER (WHERE p.publicada_en IS NOT NULL) AS publicadas,
    count(DISTINCT p.ronda) FILTER (WHERE p.publicada_en IS NOT NULL) AS rondas,
    count(*) FILTER (WHERE p.estatus IN ('me_interesa','visita_agendada','visitada','ofertada','elegida')) AS con_interes,
    count(*) FILTER (WHERE p.estatus IN ('visita_agendada','visitada','ofertada','elegida')) AS con_visita,
    count(*) FILTER (WHERE p.estatus IN ('ofertada','elegida')) AS con_oferta,
    min(p.publicada_en) AS primera_publicada_en
  FROM public.propuestas_inmuebles p
  GROUP BY p.orden_trabajo_id
),
elegida AS (
  SELECT DISTINCT ON (p.orden_trabajo_id) p.orden_trabajo_id, i.origen
  FROM public.propuestas_inmuebles p
  JOIN public.inmuebles i ON i.id = p.inmueble_id
  WHERE p.estatus = 'elegida'
  ORDER BY p.orden_trabajo_id, p.respondida_en DESC NULLS LAST
)
SELECT
  o.expediente_id,
  coalesce(e.asesor_id, o.asesor_responsable_id) AS asesor_id,
  o.etapa,
  f.ya_tiene_casa,
  e.created_at,
  f.precalificacion_fecha,
  pr.primera_publicada_en,
  CASE WHEN f.precalificacion_fecha IS NOT NULL AND pr.primera_publicada_en IS NOT NULL
       THEN (pr.primera_publicada_en::date - f.precalificacion_fecha) END AS dias_precalificacion_a_primera_opcion,
  coalesce(pr.publicadas, 0) AS opciones_publicadas,
  coalesce(pr.rondas, 0) AS rondas,
  CASE WHEN coalesce(pr.rondas, 0) > 0 THEN round(pr.publicadas::numeric / pr.rondas, 2) END AS opciones_por_ronda,
  coalesce(pr.con_interes, 0) AS opciones_con_interes,
  CASE WHEN coalesce(pr.publicadas, 0) > 0 THEN round(pr.con_interes::numeric / pr.publicadas, 4) END AS tasa_me_interesa,
  coalesce(pr.con_visita, 0) AS opciones_visitadas,
  coalesce(pr.con_oferta, 0) AS opciones_ofertadas,
  CASE WHEN coalesce(pr.con_visita, 0) > 0 THEN round(pr.con_oferta::numeric / pr.con_visita, 4) END AS tasa_visita_a_oferta,
  el.origen AS origen_cierre,
  f.fecha_escritura,
  f.precio_compraventa,
  CASE WHEN f.fecha_escritura IS NOT NULL AND e.created_at IS NOT NULL
       THEN (f.fecha_escritura - e.created_at::date) END AS dias_captacion_a_escritura,
  o.id AS orden_trabajo_id,
  o.folio
FROM public.ordenes_trabajo o
LEFT JOIN public.ot_ficha_asesoria_compra f ON f.orden_trabajo_id = o.id
LEFT JOIN public.expedientes e ON e.id = o.expediente_id
LEFT JOIN props pr ON pr.orden_trabajo_id = o.id
LEFT JOIN elegida el ON el.orden_trabajo_id = o.id
WHERE o.tipo_negocio = 'asesoria_compra' AND o.estatus <> 'cancelada';

COMMENT ON VIEW public.v_asesoria_compra_kpis IS
  'KPIs de asesoría de compra por orden de trabajo: tiempos, opciones por ronda, tasas de interés y de visita a oferta, origen del cierre y días de captación a escritura.';

-- 7. Quitar del expediente las columnas y etapas de asesoría: ver 0142 (se aplica
--    después de publicar el código que ya no las usa).
