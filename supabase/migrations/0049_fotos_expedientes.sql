-- Migración 0049: Galería de fotos para expedientes de propiedad / promoción venta
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS public.fotos_expedientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id TEXT NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  nombre_archivo TEXT,
  rotacion INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fotos_expedientes_exp ON public.fotos_expedientes(expediente_id);
