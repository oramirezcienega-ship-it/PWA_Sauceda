-- Migration 0142: El expediente vuelve a su información básica
-- ============================================================
-- Complemento de 0141: quita de `expedientes` las columnas y etapas de la
-- asesoría de compra, que ahora viven en la orden de trabajo
-- (`ot_ficha_asesoria_compra` y `ot_etapas`). Se aplica DESPUÉS de publicar el
-- código que ya no las lee. Ningún expediente usa esas columnas ni etapas.
-- ============================================================

ALTER TABLE public.expedientes
  DROP COLUMN IF EXISTS busqueda_zonas,
  DROP COLUMN IF EXISTS busqueda_precio_min,
  DROP COLUMN IF EXISTS busqueda_precio_max,
  DROP COLUMN IF EXISTS monto_credito_precalificado,
  DROP COLUMN IF EXISTS monto_ahorro_propio,
  DROP COLUMN IF EXISTS busqueda_recamaras_min,
  DROP COLUMN IF EXISTS busqueda_requisitos,
  DROP COLUMN IF EXISTS precalificacion_fecha,
  DROP COLUMN IF EXISTS precalificacion_fuente,
  DROP COLUMN IF EXISTS ya_tiene_casa,
  DROP COLUMN IF EXISTS fecha_escritura,
  DROP COLUMN IF EXISTS precio_compraventa;

-- La única restricción por expediente de propuestas_inmuebles ya no aplica
-- (las opciones son por orden de trabajo: propuestas_inmuebles_orden_inmueble_key).
ALTER TABLE public.propuestas_inmuebles DROP CONSTRAINT IF EXISTS propuestas_inmuebles_expediente_id_inmueble_id_key;

-- El flujo `solo_tramite` de la 0136 (desactivado en 0141, sin tareas) se elimina.
DELETE FROM public.bpm_flujos f
WHERE f.tipo_negocio = 'solo_tramite' AND f.activo = false
  AND NOT EXISTS (
    SELECT 1 FROM public.bpm_expediente_tareas t JOIN public.bpm_pasos p ON p.id = t.paso_id WHERE p.flujo_id = f.id
  );

-- Las etapas de asesoría salen del pipeline de expedientes (ninguno las usa).
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_etapa_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_etapa_check CHECK (etapa = ANY (ARRAY[
  'nuevo-lead', 'contactado', 'visita', 'inspeccion_programada', 'valuacion', 'oferta',
  'documentos', 'notaria', 'cerrado', 'perdido', 'interes', 'cotizacion',
  'propuesta-aceptada', 'venta', 'fuera_de_zona', 'en_pausa'
]));
