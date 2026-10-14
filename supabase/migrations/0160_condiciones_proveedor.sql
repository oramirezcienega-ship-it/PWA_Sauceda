-- Migration 0160: Condiciones comerciales a nivel proveedor
-- ============================================================
-- Anticipo, condiciones de pago, zonas donde trabaja y vigencia de sus precios son del
-- PROVEEDOR (aplican a todos sus servicios), no de cada producto. Las columnas por oferta
-- (proveedor_productos.*) quedan como respaldo histórico; la app usa las del proveedor.
-- zonas_cobertura (text[]) ya existía en proveedores (aliados) y se reutiliza.

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS anticipo_pct NUMERIC(5,2)
    CHECK (anticipo_pct IS NULL OR (anticipo_pct >= 0 AND anticipo_pct <= 100)),
  ADD COLUMN IF NOT EXISTS condiciones_pago TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vigencia_precios DATE;

-- Siembra con lo último que capturó cada proveedor en sus ofertas
WITH ultima AS (
  SELECT DISTINCT ON (proveedor_id)
    proveedor_id, anticipo_pct, condiciones_pago, zonas_cobertura, vigencia_precio
  FROM public.proveedor_productos
  WHERE activo
    AND (COALESCE(anticipo_pct, 0) > 0 OR COALESCE(condiciones_pago, '') <> '' OR COALESCE(zonas_cobertura, '') <> '' OR vigencia_precio IS NOT NULL)
  ORDER BY proveedor_id, COALESCE(actualizado_por_proveedor_at, updated_at) DESC NULLS LAST
)
UPDATE public.proveedores p SET
  anticipo_pct = COALESCE(p.anticipo_pct, NULLIF(u.anticipo_pct, 0)),
  condiciones_pago = CASE WHEN COALESCE(p.condiciones_pago, '') = '' THEN COALESCE(u.condiciones_pago, '') ELSE p.condiciones_pago END,
  vigencia_precios = COALESCE(p.vigencia_precios, u.vigencia_precio),
  zonas_cobertura = CASE
    WHEN COALESCE(array_length(p.zonas_cobertura, 1), 0) = 0 AND COALESCE(u.zonas_cobertura, '') <> ''
      THEN ARRAY(SELECT trim(z) FROM unnest(string_to_array(u.zonas_cobertura, ',')) z WHERE trim(z) <> '')
    ELSE p.zonas_cobertura
  END
FROM ultima u
WHERE p.id = u.proveedor_id;
