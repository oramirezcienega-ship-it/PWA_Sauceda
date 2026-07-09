-- Migration 0036: Agregar operador_id a expedientes y prospectos
-- ============================================================

-- 1. Agregar columna operador_id a public.expedientes apuntando a public.perfiles(id)
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS operador_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- 2. Agregar columna operador_id a public.prospectos apuntando a public.perfiles(id)
ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS operador_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- 3. Crear índices de base de datos para optimizar búsquedas por operador
CREATE INDEX IF NOT EXISTS expedientes_operador_id_idx ON public.expedientes(operador_id);
CREATE INDEX IF NOT EXISTS prospectos_operador_id_idx ON public.prospectos(operador_id);
