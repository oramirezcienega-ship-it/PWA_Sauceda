-- Migration 0163: Nuevo tipo de negocio 'seguridad'
-- ============================================================
-- Agrega la línea de negocio 'seguridad' para campañas de Meta y catálogo de productos (cámaras, alarmas, etc.).

BEGIN;

-- 1. expedientes: actualizar check constraint
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_tipo_negocio_check;

ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_tipo_negocio_check CHECK (tipo_negocio IN (
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
  'seguridad',
  'otro'
));

-- 2. productos_servicios: asegurar columna y actualizar check constraint
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
    'seguridad',
    'otro'
  )
);

CREATE INDEX IF NOT EXISTS productos_servicios_tipo_negocio_idx ON public.productos_servicios (tipo_negocio);

-- 3. Reclasificar expedientes existentes que hayan caído en 'otro' por campañas de seguridad
UPDATE public.expedientes
SET tipo_negocio = 'seguridad'
WHERE (tipo_negocio = 'otro' OR tipo_negocio IS NULL)
  AND (
    coalesce(campaign_name, '') ILIKE '%seguridad%'
    OR coalesce(adset_name, '') ILIKE '%seguridad%'
    OR coalesce(ad_name, '') ILIKE '%seguridad%'
    OR coalesce(campaign_name, '') ILIKE '%camara%'
    OR coalesce(adset_name, '') ILIKE '%camara%'
    OR coalesce(ad_name, '') ILIKE '%camara%'
    OR coalesce(situacion, '') ILIKE '%seguridad%'
    OR coalesce(situacion, '') ILIKE '%cámara%'
  );

COMMIT;
