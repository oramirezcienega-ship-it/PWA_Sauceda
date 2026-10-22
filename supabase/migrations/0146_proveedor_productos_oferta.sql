-- Migration 0146: Oferta de productos por proveedor
-- ============================================================
-- Relación N:M entre proveedores y productos_servicios: qué ofrece cada
-- proveedor, a qué costo, con qué mínimo, garantía y proceso. Permite tener
-- varios proveedores por producto y ponerlos a competir.
--
-- El precio de venta al cliente sigue viviendo en productos_servicios. El
-- proveedor marcado como `preferido` define el costo del producto
-- (costo_unitario / costos_volumen / cantidad_minima se sincronizan desde la app).

CREATE TABLE IF NOT EXISTS public.proveedor_productos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id          UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  producto_id           TEXT NOT NULL REFERENCES public.productos_servicios(id) ON DELETE CASCADE,
  -- Costo del proveedor (en la unidad del producto)
  costo_unitario        NUMERIC(12,2) NOT NULL DEFAULT 0,
  costos_volumen        JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ "hasta": 100, "costo": 150 }, ...]
  -- Mínimos de cobro del proveedor
  cantidad_minima       NUMERIC(12,2) NOT NULL DEFAULT 0,   -- abajo de esto cobra como esta cantidad
  monto_minimo          NUMERIC(12,2) NOT NULL DEFAULT 0,   -- cobro mínimo por servicio ($)
  -- Cómo lo hace y qué respalda
  descripcion_proceso   TEXT NOT NULL DEFAULT '',
  garantia_anios        NUMERIC(5,1) NOT NULL DEFAULT 0,
  garantia_condiciones  TEXT NOT NULL DEFAULT '',
  tiempo_ejecucion      TEXT NOT NULL DEFAULT '',            -- ej. "2-3 días por 100 m²"
  anticipo_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
  condiciones_pago      TEXT NOT NULL DEFAULT '',
  zonas_cobertura       TEXT NOT NULL DEFAULT '',
  fotos                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ "url": "...", "titulo": "..." }]
  ficha_tecnica_url     TEXT,
  ficha_tecnica_nombre  TEXT,
  vigencia_precio       DATE,                                -- hasta cuándo respeta el precio
  preferido             BOOLEAN NOT NULL DEFAULT false,
  activo                BOOLEAN NOT NULL DEFAULT true,
  notas                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_proveedor_producto UNIQUE (proveedor_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_proveedor_productos_proveedor ON public.proveedor_productos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_proveedor_productos_producto ON public.proveedor_productos(producto_id);

-- Solo un proveedor preferido por producto
CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedor_productos_preferido
  ON public.proveedor_productos(producto_id)
  WHERE preferido;

CREATE OR REPLACE FUNCTION public.actualizar_updated_at_proveedor_productos()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_proveedor_productos_updated_at ON public.proveedor_productos;
CREATE TRIGGER trigger_proveedor_productos_updated_at
  BEFORE UPDATE ON public.proveedor_productos
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_updated_at_proveedor_productos();

-- Historial de cambios de costo de cada oferta
CREATE TABLE IF NOT EXISTS public.proveedor_productos_historial (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id             UUID NOT NULL REFERENCES public.proveedor_productos(id) ON DELETE CASCADE,
  costo_anterior        NUMERIC(12,2) NOT NULL,
  costo_nuevo           NUMERIC(12,2) NOT NULL,
  costos_volumen_anterior JSONB NOT NULL DEFAULT '[]'::jsonb,
  costos_volumen_nuevo  JSONB NOT NULL DEFAULT '[]'::jsonb,
  fecha                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo                TEXT
);

CREATE INDEX IF NOT EXISTS idx_proveedor_productos_historial_oferta
  ON public.proveedor_productos_historial(oferta_id, fecha DESC);

ALTER TABLE public.proveedor_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedor_productos_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a proveedor_productos para autenticados" ON public.proveedor_productos;
CREATE POLICY "Acceso completo a proveedor_productos para autenticados"
  ON public.proveedor_productos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso completo a proveedor_productos_historial para autenticados" ON public.proveedor_productos_historial;
CREATE POLICY "Acceso completo a proveedor_productos_historial para autenticados"
  ON public.proveedor_productos_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);
