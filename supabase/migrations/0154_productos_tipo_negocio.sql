-- Migration 0154: Ligar cada producto/servicio del catálogo a un modelo de negocio
-- ============================================================
-- productos_servicios.tipo_negocio usa los mismos valores que expedientes.tipo_negocio.
-- Se rellena a partir del nombre para los servicios que ya existen.

BEGIN;

ALTER TABLE public.productos_servicios ADD COLUMN IF NOT EXISTS tipo_negocio text;

ALTER TABLE public.productos_servicios DROP CONSTRAINT IF EXISTS productos_servicios_tipo_negocio_check;
ALTER TABLE public.productos_servicios ADD CONSTRAINT productos_servicios_tipo_negocio_check CHECK (
  tipo_negocio IS NULL OR tipo_negocio IN (
    'traspaso_compra',
    'promocion_venta',
    'solo_tramite',
    'asesoria_compra',
    'construccion',
    'construccion-impermeabilizacion',
    'construccion-remodelacion',
    'construccion-piso-estampado',
    'construccion-mantenimiento-postventa',
    'construccion-mantenimiento-cisternas',
    'construccion-mantenimiento-tinacos',
    'construccion-mantenimiento-calentadores',
    'construccion-herreria',
    'otro'
  )
);

UPDATE public.productos_servicios SET tipo_negocio = CASE
    WHEN nombre ILIKE '%calentador%' OR nombre ILIKE '%solar%' THEN 'construccion-mantenimiento-calentadores'
    WHEN nombre ILIKE '%tinaco%' THEN 'construccion-mantenimiento-tinacos'
    WHEN nombre ILIKE '%cisterna%' OR nombre ILIKE '%aljibe%' THEN 'construccion-mantenimiento-cisternas'
    WHEN nombre ILIKE '%impermeab%' THEN 'construccion-impermeabilizacion'
    WHEN nombre ILIKE '%estampado%' THEN 'construccion-piso-estampado'
    WHEN nombre ILIKE '%herrer%' THEN 'construccion-herreria'
  END
WHERE tipo_negocio IS NULL
  AND (nombre ILIKE ANY (ARRAY['%calentador%','%solar%','%tinaco%','%cisterna%','%aljibe%','%impermeab%','%estampado%','%herrer%']));

CREATE INDEX IF NOT EXISTS productos_servicios_tipo_negocio_idx ON public.productos_servicios (tipo_negocio);

COMMIT;
