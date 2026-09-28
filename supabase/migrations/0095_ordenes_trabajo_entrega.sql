-- ============================================================
-- Migración 0095: Tokens de portal público y trazabilidad de entrega para Órdenes de Trabajo
-- ============================================================

-- 1. Agregar token público a ordenes_trabajo
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS token TEXT UNIQUE;

-- 2. Agregar trazabilidad de notificación de entrega al cliente
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS notificado_cliente_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canal_notificacion TEXT;

-- 3. Poblar tokens para órdenes de trabajo existentes que no tengan
UPDATE public.ordenes_trabajo
SET token = encode(gen_random_bytes(16), 'hex')
WHERE token IS NULL;

-- 4. Asegurar índice para búsqueda rápida por token
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_token ON public.ordenes_trabajo(token);
