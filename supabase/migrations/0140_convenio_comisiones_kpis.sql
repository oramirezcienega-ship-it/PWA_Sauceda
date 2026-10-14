-- Migration 0140: Asesoría de compra — Fase 5 (convenio con aliados, comisión al cierre y KPIs)
-- ============================================================
-- 1. `contratos` también guarda convenios con aliados (sin orden de trabajo).
-- 2. Plantilla "Convenio de comisión compartida" en `plantillas_clausulas`.
-- 3. `comisiones` registra el pago al aliado (proveedor) al cierre.
-- 4. Regla de honorarios del lado comprador en `comisiones_reglas`.
-- 5. Fecha de escritura en el expediente y vistas de KPIs (security_invoker).
-- Los flujos existentes no cambian: las columnas nuevas son opcionales y las
-- restricciones solo se amplían.
-- ============================================================

-- 1. Convenios en `contratos` -------------------------------------------------
ALTER TABLE public.contratos ALTER COLUMN orden_trabajo_id DROP NOT NULL;
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_origen_check') THEN
    -- Todo contrato pertenece a una orden de trabajo o a un aliado (convenio).
    ALTER TABLE public.contratos ADD CONSTRAINT contratos_origen_check
      CHECK (orden_trabajo_id IS NOT NULL OR proveedor_id IS NOT NULL);
  END IF;
END
$c$;

CREATE INDEX IF NOT EXISTS contratos_proveedor_idx ON public.contratos(proveedor_id) WHERE proveedor_id IS NOT NULL;

-- 2. Plantilla del convenio (editable desde la configuración de cláusulas) -----
INSERT INTO public.plantillas_clausulas (tipo_servicio, clave, texto) VALUES
  ('convenio_aliado', 'titulo', 'CONVENIO DE COMISIÓN COMPARTIDA'),
  ('convenio_aliado', 'partes',
   'Celebran el presente convenio, por una parte, {prestador} (en adelante "SAUCEDA"), con domicilio en {prestador_domicilio}, y por la otra {aliado} (en adelante "EL ALIADO"), representado por {aliado_contacto}.'),
  ('convenio_aliado', 'objeto',
   'EL ALIADO comparte con SAUCEDA inmuebles de su inventario para los compradores que SAUCEDA asesora. Cuando un comprador presentado por SAUCEDA adquiera un inmueble aportado por EL ALIADO, ambas partes compartirán la comisión correspondiente al lado comprador.'),
  ('convenio_aliado', 'comision',
   'EL ALIADO recibirá el {pct}% de los honorarios del lado comprador que cobre SAUCEDA en cada operación cerrada con un inmueble aportado por él. El pago se realizará dentro de los 10 días hábiles siguientes a la firma de la escritura y a que SAUCEDA haya cobrado sus honorarios.'),
  ('convenio_aliado', 'no_contacto',
   'EL ALIADO se obliga a no contactar directamente, por sí o por interpósita persona, a ningún cliente presentado por SAUCEDA, ni a ofrecerle otros inmuebles o servicios, durante la vigencia de este convenio y los 12 meses posteriores. Toda comunicación con el cliente se hará a través de SAUCEDA. El incumplimiento dará lugar al pago íntegro a SAUCEDA de la comisión de la operación correspondiente.'),
  ('convenio_aliado', 'vigencia',
   'El presente convenio tiene una vigencia de 12 meses a partir de su firma y se renovará automáticamente por periodos iguales, salvo aviso por escrito de cualquiera de las partes con 30 días de anticipación. Las operaciones iniciadas durante la vigencia conservarán las condiciones aquí pactadas.'),
  ('convenio_aliado', 'confidencialidad',
   'Las partes guardarán estricta confidencialidad sobre los datos personales de los clientes, de los propietarios y sobre las condiciones comerciales de este convenio, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.'),
  ('convenio_aliado', 'firma', 'Leído que fue el presente convenio, las partes lo firman de conformidad en León, Guanajuato, el {fecha}.')
ON CONFLICT (tipo_servicio, clave) DO NOTHING;

-- 3. Comisión al aliado ---------------------------------------------------------
ALTER TABLE public.comisiones ALTER COLUMN asesor_id DROP NOT NULL;
ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS propuesta_id uuid REFERENCES public.propuestas_inmuebles(id) ON DELETE SET NULL;

ALTER TABLE public.comisiones DROP CONSTRAINT IF EXISTS comisiones_tipo_comision_check;
ALTER TABLE public.comisiones ADD CONSTRAINT comisiones_tipo_comision_check
  CHECK (tipo_comision IN ('venta', 'inspeccion', 'bono', 'otro', 'aliado'));

DO $b$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comisiones_beneficiario_check') THEN
    -- Una comisión es para un asesor o, si es de aliado, para un proveedor.
    ALTER TABLE public.comisiones ADD CONSTRAINT comisiones_beneficiario_check
      CHECK (asesor_id IS NOT NULL OR (tipo_comision = 'aliado' AND proveedor_id IS NOT NULL));
  END IF;
END
$b$;

-- Una sola comisión de aliado por propuesta cerrada.
CREATE UNIQUE INDEX IF NOT EXISTS comisiones_aliado_propuesta_uq
  ON public.comisiones(propuesta_id) WHERE tipo_comision = 'aliado' AND estatus <> 'cancelada';

-- 4. Honorarios del lado comprador (base de la comisión compartida).
--    Se guarda como regla de tipo 'servicio' para editarla desde Comisiones.
INSERT INTO public.comisiones_reglas (tipo, clave, etiqueta, porcentaje, notas)
SELECT 'servicio', 'asesoria_compra_honorarios', 'Honorarios lado comprador (asesoría de compra)', 3.00,
       'Porcentaje sobre el precio de compraventa que cobra SAUCEDA al comprador. El aliado recibe su % compartido sobre este monto. AJUSTAR al valor real.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.comisiones_reglas WHERE tipo = 'servicio' AND clave = 'asesoria_compra_honorarios'
);

-- 5. Cierre y KPIs ---------------------------------------------------------------
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS fecha_escritura date,
  ADD COLUMN IF NOT EXISTS precio_compraventa numeric;

-- Una fila por expediente de asesoría de compra.
CREATE OR REPLACE VIEW public.v_asesoria_compra_kpis WITH (security_invoker = true) AS
WITH props AS (
  SELECT
    p.expediente_id,
    count(*) FILTER (WHERE p.publicada_en IS NOT NULL)                                        AS publicadas,
    count(DISTINCT p.ronda) FILTER (WHERE p.publicada_en IS NOT NULL)                          AS rondas,
    count(*) FILTER (WHERE p.estatus IN ('me_interesa','visita_agendada','visitada','ofertada','elegida')) AS con_interes,
    count(*) FILTER (WHERE p.estatus IN ('visita_agendada','visitada','ofertada','elegida'))   AS con_visita,
    count(*) FILTER (WHERE p.estatus IN ('ofertada','elegida'))                                AS con_oferta,
    min(p.publicada_en)                                                                         AS primera_publicada_en
  FROM public.propuestas_inmuebles p
  GROUP BY p.expediente_id
),
elegida AS (
  SELECT DISTINCT ON (p.expediente_id) p.expediente_id, i.origen
  FROM public.propuestas_inmuebles p
  JOIN public.inmuebles i ON i.id = p.inmueble_id
  WHERE p.estatus = 'elegida'
  ORDER BY p.expediente_id, p.respondida_en DESC NULLS LAST
)
SELECT
  e.id                                   AS expediente_id,
  e.asesor_id,
  e.etapa,
  e.ya_tiene_casa,
  e.created_at,
  e.precalificacion_fecha,
  pr.primera_publicada_en,
  CASE WHEN e.precalificacion_fecha IS NOT NULL AND pr.primera_publicada_en IS NOT NULL
       THEN (pr.primera_publicada_en::date - e.precalificacion_fecha) END        AS dias_precalificacion_a_primera_opcion,
  coalesce(pr.publicadas, 0)             AS opciones_publicadas,
  coalesce(pr.rondas, 0)                 AS rondas,
  CASE WHEN coalesce(pr.rondas, 0) > 0 THEN round(pr.publicadas::numeric / pr.rondas, 2) END AS opciones_por_ronda,
  coalesce(pr.con_interes, 0)            AS opciones_con_interes,
  CASE WHEN coalesce(pr.publicadas, 0) > 0 THEN round(pr.con_interes::numeric / pr.publicadas, 4) END AS tasa_me_interesa,
  coalesce(pr.con_visita, 0)             AS opciones_visitadas,
  coalesce(pr.con_oferta, 0)             AS opciones_ofertadas,
  CASE WHEN coalesce(pr.con_visita, 0) > 0 THEN round(pr.con_oferta::numeric / pr.con_visita, 4) END AS tasa_visita_a_oferta,
  el.origen                              AS origen_cierre,
  e.fecha_escritura,
  e.precio_compraventa,
  CASE WHEN e.fecha_escritura IS NOT NULL THEN (e.fecha_escritura - e.created_at::date) END AS dias_captacion_a_escritura
FROM public.expedientes e
LEFT JOIN props pr ON pr.expediente_id = e.id
LEFT JOIN elegida el ON el.expediente_id = e.id
WHERE e.tipo_negocio = 'asesoria_compra';

COMMENT ON VIEW public.v_asesoria_compra_kpis IS
  'KPIs de asesoría de compra por expediente: tiempos, opciones por ronda, tasas de interés y de visita a oferta, origen del cierre y días de captación a escritura.';

-- Tasa de respuesta por aliado.
CREATE OR REPLACE VIEW public.v_asesoria_compra_aliados_kpis WITH (security_invoker = true) AS
SELECT
  pv.id                                                                         AS aliado_id,
  pv.nombre,
  pv.convenio_estatus,
  pv.calificacion,
  count(b.id)                                                                   AS busquedas,
  count(b.id) FILTER (WHERE b.estado IN ('respondida','sin_resultados'))        AS respondidas,
  count(b.id) FILTER (WHERE b.estado = 'vencida'
                      OR (b.estado IN ('enviada','vista') AND b.fecha_limite < now())) AS vencidas,
  CASE WHEN count(b.id) FILTER (WHERE b.estado NOT IN ('enviada','vista') OR b.fecha_limite < now()) > 0
       THEN round(
         count(b.id) FILTER (WHERE b.estado IN ('respondida','sin_resultados'))::numeric
         / count(b.id) FILTER (WHERE b.estado NOT IN ('enviada','vista') OR b.fecha_limite < now()), 4)
  END                                                                           AS tasa_respuesta,
  coalesce(sum(b.inmuebles_recibidos), 0)                                       AS casas_recibidas
FROM public.proveedores pv
LEFT JOIN public.busquedas_aliados b ON b.aliado_id = pv.id
WHERE pv.es_aliado_inmobiliario
GROUP BY pv.id, pv.nombre, pv.convenio_estatus, pv.calificacion;
