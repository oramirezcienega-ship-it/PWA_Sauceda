-- Migration 0074: Permitir etapa 'visita' e 'inspeccion_programada' en public.expedientes
-- ==============================================================================================

-- 1. Eliminar restricción de check actual de etapa en expedientes si existe
ALTER TABLE public.expedientes
  DROP CONSTRAINT IF EXISTS expedientes_etapa_check;

-- 2. Agregar la nueva restricción que incluye 'visita' e 'inspeccion_programada'
ALTER TABLE public.expedientes
  ADD CONSTRAINT expedientes_etapa_check
  CHECK (etapa IN (
    'nuevo-lead', 'contactado', 'visita', 'inspeccion_programada', 'valuacion', 'oferta',
    'documentos', 'notaria', 'cerrado', 'perdido', 'interes', 'cotizacion', 'propuesta-aceptada', 'venta'
  ));
