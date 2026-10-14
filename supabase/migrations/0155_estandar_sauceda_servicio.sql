-- Migration 0155: Estándar Sauceda por servicio (fase 1)
-- ============================================================
-- El proceso, lo que incluye, la garantía y el tiempo objetivo los define Sauceda
-- en el servicio del catálogo; el proveedor solo confirma que lo cumple y anota
-- excepciones o mejoras. Hacia el cliente siempre va la garantía de Sauceda.
-- Se siembra el estándar con lo que ya capturó el proveedor preferido (o el
-- último que actualizó) en los servicios que aún no lo tienen.

BEGIN;

ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS estandar_proceso text,
  ADD COLUMN IF NOT EXISTS estandar_incluye text,
  ADD COLUMN IF NOT EXISTS estandar_garantia_anios numeric,
  ADD COLUMN IF NOT EXISTS estandar_garantia text,
  ADD COLUMN IF NOT EXISTS estandar_tiempo text;

ALTER TABLE public.proveedor_productos
  ADD COLUMN IF NOT EXISTS cumple_estandar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excepciones_estandar text,
  ADD COLUMN IF NOT EXISTS cumple_estandar_at timestamptz;

WITH fuente AS (
  SELECT DISTINCT ON (producto_id)
    producto_id, descripcion_proceso, garantia_anios, garantia_condiciones, tiempo_ejecucion
  FROM public.proveedor_productos
  WHERE activo
  ORDER BY producto_id, preferido DESC, actualizado_por_proveedor_at DESC NULLS LAST, updated_at DESC NULLS LAST
)
UPDATE public.productos_servicios ps SET
  estandar_proceso = COALESCE(ps.estandar_proceso, NULLIF(trim(f.descripcion_proceso), '')),
  estandar_garantia_anios = COALESCE(ps.estandar_garantia_anios, NULLIF(f.garantia_anios, 0)),
  estandar_garantia = COALESCE(ps.estandar_garantia, NULLIF(trim(f.garantia_condiciones), '')),
  estandar_tiempo = COALESCE(ps.estandar_tiempo, NULLIF(trim(f.tiempo_ejecucion), ''))
FROM fuente f
WHERE ps.id = f.producto_id;

COMMIT;
