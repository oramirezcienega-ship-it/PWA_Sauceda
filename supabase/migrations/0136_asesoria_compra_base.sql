-- Migration 0136: Asesoría y acompañamiento al comprador — Fase 1 (flujo y perfil)
-- ============================================================
-- Solo agrega cosas: no cambia la lógica de los flujos existentes
-- (construccion-*, traspaso_compra, promocion_venta).
--
-- 1. Perfil de búsqueda en `expedientes`.
-- 2. Nuevo tipo de negocio `asesoria_compra` y sus etapas de pipeline.
-- 3. Motor BPM: roles `gestor`/`sistema`, condición opcional sobre campos del
--    expediente (`bpm_pasos.condicion_campo`) y condición efectiva por tarea
--    (`bpm_expediente_tareas.condicion_activacion_efectiva`). Ambas son
--    nullable: los flujos existentes se comportan igual que antes.
-- 4. Flujo BPM `asesoria_compra` (13 pasos) y flujo `solo_tramite`
--    (captación, precalificación, expediente, escrituración y entrega).
-- ============================================================

-- 1. Perfil de búsqueda del comprador ---------------------------------------
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS busqueda_zonas text[],
  ADD COLUMN IF NOT EXISTS busqueda_precio_min numeric,
  ADD COLUMN IF NOT EXISTS busqueda_precio_max numeric,
  ADD COLUMN IF NOT EXISTS monto_credito_precalificado numeric,
  ADD COLUMN IF NOT EXISTS monto_ahorro_propio numeric,
  ADD COLUMN IF NOT EXISTS busqueda_recamaras_min int,
  ADD COLUMN IF NOT EXISTS busqueda_requisitos text,
  ADD COLUMN IF NOT EXISTS precalificacion_fecha date,
  ADD COLUMN IF NOT EXISTS precalificacion_fuente text,
  ADD COLUMN IF NOT EXISTS ya_tiene_casa boolean DEFAULT false;

ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_precalificacion_fuente_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_precalificacion_fuente_check
  CHECK (precalificacion_fuente IS NULL OR precalificacion_fuente IN ('infonavit','fovissste','bancario','cofinavit','otro'));

COMMENT ON COLUMN public.expedientes.monto_credito_precalificado IS 'Crédito + subcuenta autorizados en la precalificación. Poder de compra = este monto + monto_ahorro_propio.';
COMMENT ON COLUMN public.expedientes.ya_tiene_casa IS 'true = el comprador ya tiene casa: el flujo asesoria_compra se salta búsqueda y negociación.';

-- 2. Tipo de negocio y etapas de pipeline -----------------------------------
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_tipo_negocio_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_tipo_negocio_check CHECK (tipo_negocio = ANY (ARRAY[
  'traspaso_compra', 'promocion_venta', 'solo_tramite', 'asesoria_compra',
  'construccion', 'construccion-impermeabilizacion', 'construccion-remodelacion',
  'construccion-piso-estampado', 'construccion-mantenimiento-postventa',
  'construccion-mantenimiento-cisternas', 'construccion-mantenimiento-tinacos',
  'construccion-herreria', 'otro'
]));

ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_etapa_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_etapa_check CHECK (etapa = ANY (ARRAY[
  'nuevo-lead', 'contactado', 'visita', 'inspeccion_programada', 'valuacion', 'oferta',
  'documentos', 'notaria', 'cerrado', 'perdido', 'interes', 'cotizacion',
  'propuesta-aceptada', 'venta', 'fuera_de_zona', 'en_pausa',
  -- Asesoría de compra (mismos nombres que las etapas del flujo BPM)
  'captacion', 'precalificacion', 'busqueda', 'negociacion', 'expediente',
  'escrituracion', 'entrega'
]));

-- 3. Motor BPM (extensión retrocompatible) ----------------------------------
ALTER TABLE public.bpm_pasos DROP CONSTRAINT IF EXISTS bpm_pasos_rol_responsable_check;
ALTER TABLE public.bpm_pasos ADD CONSTRAINT bpm_pasos_rol_responsable_check
  CHECK (rol_responsable IN ('asesor', 'operaciones', 'tecnico', 'admin', 'gestor', 'sistema'));

ALTER TABLE public.bpm_pasos ADD COLUMN IF NOT EXISTS condicion_campo jsonb;
COMMENT ON COLUMN public.bpm_pasos.condicion_campo IS
  'Opcional. Condición sobre campos del expediente para generar el paso, p. ej. {"campo":"ya_tiene_casa","igual":false} o un arreglo de condiciones (AND). NULL = siempre aplica.';

ALTER TABLE public.bpm_expediente_tareas ADD COLUMN IF NOT EXISTS condicion_activacion_efectiva text;
COMMENT ON COLUMN public.bpm_expediente_tareas.condicion_activacion_efectiva IS
  'Opcional. Sustituye a bpm_pasos.condicion_activacion cuando el paso del que dependía no aplica al expediente (se omitió por condicion_campo).';

-- 4. Flujos ------------------------------------------------------------------
INSERT INTO public.bpm_flujos (tipo_negocio, activo)
VALUES ('asesoria_compra', true), ('solo_tramite', true)
ON CONFLICT (tipo_negocio) DO NOTHING;

-- Pasos de asesoria_compra (solo si el flujo aún no tiene pasos).
WITH flujo AS (
  SELECT id FROM public.bpm_flujos WHERE tipo_negocio = 'asesoria_compra'
), pasos (orden, etapa, titulo, rol, dias, condicion, condicion_campo) AS (
  VALUES
    (1,  'captacion',       'Contactar y levantar perfil del comprador',              'asesor',  1,  'inmediato', NULL::jsonb),
    (2,  'precalificacion', 'Solicitar NSS / datos y obtener precalificación',        'asesor',  3,  'Contactar y levantar perfil del comprador', NULL),
    (3,  'precalificacion', 'Registrar monto autorizado y perfil de búsqueda',        'asesor',  1,  'Solicitar NSS / datos y obtener precalificación', NULL),
    (4,  'busqueda',        'Cruzar perfil contra inventario propio',                 'sistema', 0,  'Registrar monto autorizado y perfil de búsqueda', '{"campo":"ya_tiene_casa","igual":false}'::jsonb),
    (5,  'busqueda',        'Enviar solicitud a aliados de la zona',                  'asesor',  1,  'Cruzar perfil contra inventario propio', '{"campo":"ya_tiene_casa","igual":false}'::jsonb),
    (6,  'busqueda',        'Validar y publicar 3 a 5 opciones al cliente',           'asesor',  3,  'Enviar solicitud a aliados de la zona', '{"campo":"ya_tiene_casa","igual":false}'::jsonb),
    (7,  'busqueda',        'Agendar y realizar visitas',                             'asesor',  7,  'Validar y publicar 3 a 5 opciones al cliente', '{"campo":"ya_tiene_casa","igual":false}'::jsonb),
    (8,  'negociacion',     'Presentar oferta y confirmar fee con el aliado',         'asesor',  5,  'Agendar y realizar visitas', '{"campo":"ya_tiene_casa","igual":false}'::jsonb),
    (9,  'negociacion',     'Firmar apartado / promesa',                              'asesor',  3,  'Presentar oferta y confirmar fee con el aliado', '{"campo":"ya_tiene_casa","igual":false}'::jsonb),
    (10, 'expediente',      'Generar orden de trabajo del trámite',                   'asesor',  1,  'Firmar apartado / promesa', NULL),
    (11, 'expediente',      'Avalúo, libertad de gravamen, alineamiento, documentos', 'gestor',  20, 'Generar orden de trabajo del trámite', NULL),
    (12, 'escrituracion',   'Coordinar notaría y fecha de firma',                     'gestor',  10, 'Avalúo, libertad de gravamen, alineamiento, documentos', NULL),
    (13, 'entrega',         'Entrega de llaves, testimonio y oferta de Construye',    'asesor',  7,  'Coordinar notaría y fecha de firma', NULL)
)
INSERT INTO public.bpm_pasos (flujo_id, etapa, orden, titulo_tarea, descripcion, rol_responsable, dias_vencimiento, condicion_activacion, condicion_campo)
SELECT flujo.id, p.etapa, p.orden, p.titulo, NULL, p.rol, p.dias, p.condicion, p.condicion_campo
FROM flujo, pasos p
WHERE NOT EXISTS (SELECT 1 FROM public.bpm_pasos bp WHERE bp.flujo_id = flujo.id);

-- Pasos de solo_tramite: el cliente ya tiene casa (sin búsqueda ni negociación).
WITH flujo AS (
  SELECT id FROM public.bpm_flujos WHERE tipo_negocio = 'solo_tramite'
), pasos (orden, etapa, titulo, rol, dias, condicion) AS (
  VALUES
    (1, 'captacion',       'Contactar y levantar perfil del comprador',              'asesor', 1,  'inmediato'),
    (2, 'precalificacion', 'Solicitar NSS / datos y obtener precalificación',        'asesor', 3,  'Contactar y levantar perfil del comprador'),
    (3, 'precalificacion', 'Registrar monto autorizado y perfil de búsqueda',        'asesor', 1,  'Solicitar NSS / datos y obtener precalificación'),
    (4, 'expediente',      'Generar orden de trabajo del trámite',                   'asesor', 1,  'Registrar monto autorizado y perfil de búsqueda'),
    (5, 'expediente',      'Avalúo, libertad de gravamen, alineamiento, documentos', 'gestor', 20, 'Generar orden de trabajo del trámite'),
    (6, 'escrituracion',   'Coordinar notaría y fecha de firma',                     'gestor', 10, 'Avalúo, libertad de gravamen, alineamiento, documentos'),
    (7, 'entrega',         'Entrega de llaves, testimonio y oferta de Construye',    'asesor', 7,  'Coordinar notaría y fecha de firma')
)
INSERT INTO public.bpm_pasos (flujo_id, etapa, orden, titulo_tarea, descripcion, rol_responsable, dias_vencimiento, condicion_activacion)
SELECT flujo.id, p.etapa, p.orden, p.titulo, NULL, p.rol, p.dias, p.condicion
FROM flujo, pasos p
WHERE NOT EXISTS (SELECT 1 FROM public.bpm_pasos bp WHERE bp.flujo_id = flujo.id);
