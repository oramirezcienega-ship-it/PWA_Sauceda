-- Migration 0038: Agregar descuento a conceptos e introducir catálogo de productos/servicios
ALTER TABLE public.cotizacion_conceptos
  ADD COLUMN IF NOT EXISTS descuento NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.productos_servicios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  unidad TEXT DEFAULT 'm2',
  costo_unitario NUMERIC DEFAULT 0,
  precio_unitario NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.productos_servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura publica de productos_servicios" ON public.productos_servicios
  FOR SELECT USING (true);
