-- Migration 0153: Nuevo tipo de negocio 'construccion-mantenimiento-calentadores'
-- ============================================================
-- El código ya detectaba la campaña de calentadores solares, pero el check
-- rechazaba el valor e insertarExpedienteSeguro lo guardaba como "otro".
-- También reclasifica los expedientes que ya cayeron en "otro" por esa campaña.

BEGIN;

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
  'otro'
));

UPDATE public.expedientes
SET tipo_negocio = 'construccion-mantenimiento-calentadores'
WHERE tipo_negocio = 'otro'
  AND (
    coalesce(adset_name, '') ILIKE '%calentador%'
    OR coalesce(ad_name, '') ILIKE '%calentador%'
    OR coalesce(situacion, '') ILIKE '%calentador%'
  );

COMMIT;
