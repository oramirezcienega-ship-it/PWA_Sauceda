-- Migration 0148: Link público para que el proveedor actualice sus precios
-- ============================================================
-- Cada proveedor tiene un link /precios-proveedor/{token} (sin login) donde
-- ve y edita SU oferta: costos, mínimos, garantía, proceso, tiempos, pago,
-- zonas, vigencia y fotos. Nunca ve nuestro precio de venta ni el margen.
-- Lee y escribe solo vía server actions que validan `proveedores.token_precios`;
-- no se abre acceso anon a ninguna tabla.
--
-- Lo que captura el proveedor queda `pendiente_revision` hasta que lo revisamos
-- en el CRM; el costo del producto (proveedor preferido) solo se sincroniza al revisar.

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS token_precios TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedores_token_precios
  ON public.proveedores(token_precios)
  WHERE token_precios IS NOT NULL;

ALTER TABLE public.proveedor_productos
  ADD COLUMN IF NOT EXISTS pendiente_revision BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actualizado_por_proveedor_at TIMESTAMPTZ;
