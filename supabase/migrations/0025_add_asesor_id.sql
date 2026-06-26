-- Migration 0025: Agregar asesor_id a expedientes y prospectos
-- ============================================================

-- 1. Agregar columna asesor_id a public.expedientes apuntando a public.perfiles(id)
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS asesor_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- 2. Agregar columna asesor_id a public.prospectos apuntando a public.perfiles(id)
ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS asesor_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- 3. Crear índices de base de datos para optimizar búsquedas por asesor
CREATE INDEX IF NOT EXISTS expedientes_asesor_id_idx ON public.expedientes(asesor_id);
CREATE INDEX IF NOT EXISTS prospectos_asesor_id_idx ON public.prospectos(asesor_id);
