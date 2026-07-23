-- Migration 0054: Cartas de Garantía
-- ============================================================

-- 1. Agregar columna de plantilla de garantía al catálogo de productos/servicios
ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS plantilla_garantia TEXT;

-- 2. Crear Tabla para almacenar las garantías generadas y personalizadas por cotización
CREATE TABLE IF NOT EXISTS public.garantias_documentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id   TEXT NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  remision_id     UUID REFERENCES public.remisiones_facturas(id) ON DELETE SET NULL,
  titulo          TEXT NOT NULL DEFAULT 'Carta de Garantía',
  contenido       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crear índice único para asegurar una sola carta de garantía por cotización
CREATE UNIQUE INDEX IF NOT EXISTS garantias_documentos_cot_idx ON public.garantias_documentos(cotizacion_id);

-- RLS
ALTER TABLE public.garantias_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura publica de garantias" ON public.garantias_documentos
  FOR SELECT USING (true);

CREATE POLICY "Permitir todo a usuarios autenticados en garantias" ON public.garantias_documentos
  FOR ALL TO authenticated USING (true);
