-- Migration 0156: Variantes (capacidades) del servicio y costo de cada proveedor por variante (fase 2)
-- ============================================================
-- producto_variantes: las capacidades que vende Sauceda (12 tubos, 1,100 L…) con su precio de venta.
-- oferta_variante_costos: lo que le cuesta a Sauceda cada variante con cada proveedor.
-- Son la fuente de verdad. Los JSON productos_servicios.tarifas_capacidad y
-- proveedor_productos.tarifas_capacidad se siguen escribiendo como copia para los lectores existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.producto_variantes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id  TEXT NOT NULL REFERENCES public.productos_servicios(id) ON DELETE CASCADE,
  hasta        INTEGER NOT NULL CHECK (hasta > 0),
  precio_venta NUMERIC(14,2) CHECK (precio_venta IS NULL OR precio_venta >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (producto_id, hasta)
);

CREATE TABLE IF NOT EXISTS public.oferta_variante_costos (
  oferta_id   UUID NOT NULL REFERENCES public.proveedor_productos(id) ON DELETE CASCADE,
  variante_id UUID NOT NULL REFERENCES public.producto_variantes(id) ON DELETE CASCADE,
  costo       NUMERIC(14,2) NOT NULL CHECK (costo >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (oferta_id, variante_id)
);

CREATE INDEX IF NOT EXISTS idx_producto_variantes_producto ON public.producto_variantes(producto_id, hasta);
CREATE INDEX IF NOT EXISTS idx_oferta_variante_costos_variante ON public.oferta_variante_costos(variante_id);

ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oferta_variante_costos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a producto_variantes para autenticados" ON public.producto_variantes;
CREATE POLICY "Acceso completo a producto_variantes para autenticados"
  ON public.producto_variantes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso completo a oferta_variante_costos para autenticados" ON public.oferta_variante_costos;
CREATE POLICY "Acceso completo a oferta_variante_costos para autenticados"
  ON public.oferta_variante_costos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Variantes desde el catálogo
INSERT INTO public.producto_variantes (producto_id, hasta, precio_venta)
SELECT ps.id, round((t->>'hasta_litros')::numeric)::int, NULLIF(t->>'precio', '')::numeric
FROM public.productos_servicios ps,
     jsonb_array_elements(COALESCE(ps.tarifas_capacidad, '[]'::jsonb)) t
WHERE (t->>'hasta_litros') ~ '^[0-9.]+$' AND (t->>'hasta_litros')::numeric > 0
ON CONFLICT (producto_id, hasta) DO NOTHING;

-- Capacidades que sólo existían en ofertas de proveedores: se agregan al catálogo sin precio
INSERT INTO public.producto_variantes (producto_id, hasta)
SELECT DISTINCT pp.producto_id, round((t->>'hasta_litros')::numeric)::int
FROM public.proveedor_productos pp,
     jsonb_array_elements(COALESCE(pp.tarifas_capacidad, '[]'::jsonb)) t
WHERE (t->>'hasta_litros') ~ '^[0-9.]+$' AND (t->>'hasta_litros')::numeric > 0
ON CONFLICT (producto_id, hasta) DO NOTHING;

-- Costos de cada proveedor por variante
INSERT INTO public.oferta_variante_costos (oferta_id, variante_id, costo)
SELECT pp.id, v.id, (t->>'costo')::numeric
FROM public.proveedor_productos pp
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pp.tarifas_capacidad, '[]'::jsonb)) t
JOIN public.producto_variantes v
  ON v.producto_id = pp.producto_id AND v.hasta = round((t->>'hasta_litros')::numeric)::int
WHERE (t->>'costo') ~ '^[0-9.]+$'
ON CONFLICT (oferta_id, variante_id) DO NOTHING;

COMMIT;
