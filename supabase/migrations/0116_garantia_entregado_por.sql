-- Migration 0116: Asesor que entrega la instalación en la póliza de garantía
-- ============================================================
-- perfiles.nombre_completo: nombre completo para documentos (la mayoría de los perfiles
-- solo tiene el primer nombre). garantias_documentos guarda quién entrega y el nombre
-- tal como debe aparecer en la póliza.

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS nombre_completo TEXT;

ALTER TABLE public.garantias_documentos
  ADD COLUMN IF NOT EXISTS entregado_por_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entregado_por_nombre TEXT;
