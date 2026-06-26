-- ============================================================
-- MÓDULO: PROSPECTOS  ·  Campos: estatus y calificación
-- ------------------------------------------------------------
-- Agrega estatus y calificación al prospecto con restricciones CHECK
-- y realiza una actualización (backfill) basada en expedientes existentes.
-- ============================================================

-- 1. Agregar columnas con constraints CHECK
ALTER TABLE public.prospectos 
  ADD COLUMN IF NOT EXISTS estatus TEXT NOT NULL DEFAULT 'nuevo'
  CONSTRAINT check_prospectos_estatus CHECK (estatus IN ('nuevo', 'en_conversacion', 'no_viable', 'sin_contacto', 'expediente_abierto', 'cliente'));

ALTER TABLE public.prospectos 
  ADD COLUMN IF NOT EXISTS calificacion TEXT NOT NULL DEFAULT 'frio'
  CONSTRAINT check_prospectos_calificacion CHECK (calificacion IN ('caliente', 'templado', 'frio', 'descalificado'));

-- 2. Migración de datos inicial (backfill) basado en expedientes y mensajes
-- Si el prospecto tiene algún expediente cerrado, marcar como cliente/caliente.
UPDATE public.prospectos p
SET estatus = 'cliente', calificacion = 'caliente'
WHERE EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa = 'cerrado'
);

-- Si el prospecto tiene únicamente expedientes perdidos, marcar como no_viable/descalificado.
UPDATE public.prospectos p
SET estatus = 'no_viable', calificacion = 'descalificado'
WHERE EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa = 'perdido'
) AND NOT EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa <> 'perdido'
);

-- Si el prospecto tiene expedientes abiertos/en proceso, marcar como expediente_abierto/templado.
UPDATE public.prospectos p
SET estatus = 'expediente_abierto', calificacion = 'templado'
WHERE EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa NOT IN ('cerrado', 'perdido')
);

-- Si el prospecto no tiene expedientes pero sí tiene registros de mensajes, marcar como en_conversacion/frio.
UPDATE public.prospectos p
SET estatus = 'en_conversacion'
WHERE estatus = 'nuevo' AND (
  EXISTS (
    SELECT 1 FROM public.mensajes_whatsapp m 
    WHERE m.telefono = p.telefono OR (p.canal_id IS NOT NULL AND m.canal_id = p.canal_id)
  )
);
