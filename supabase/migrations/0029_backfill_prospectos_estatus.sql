-- Sincronizar prospectos que tienen algún expediente en 'cerrado' a 'cliente'/'caliente'
UPDATE public.prospectos p
SET estatus = 'cliente', calificacion = 'caliente'
WHERE EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa = 'cerrado'
) AND (p.estatus <> 'cliente' OR p.calificacion <> 'caliente');

-- Sincronizar prospectos que tienen únicamente expedientes perdidos a 'no_viable'/'descalificado'
UPDATE public.prospectos p
SET estatus = 'no_viable', calificacion = 'descalificado'
WHERE EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa = 'perdido'
) AND NOT EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa <> 'perdido'
) AND (p.estatus <> 'no_viable' OR p.calificacion <> 'descalificado');

-- Sincronizar prospectos que tienen expedientes activos/en proceso a 'expediente_abierto'/'templado'
UPDATE public.prospectos p
SET estatus = 'expediente_abierto', calificacion = 'templado'
WHERE EXISTS (
  SELECT 1 FROM public.expedientes e 
  WHERE e.prospecto_id = p.id AND e.etapa NOT IN ('cerrado', 'perdido')
) AND (p.estatus <> 'expediente_abierto' OR p.calificacion <> 'templado');
