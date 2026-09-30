-- Migration 0114: Nuevo tipo de negocio 'construccion-mantenimiento-tinacos'
-- ============================================================
-- Separa "Mantenimiento Tinacos" de "Mantenimiento Cisternas" para que Sofía use
-- el producto y el script correspondientes.

BEGIN;

ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_tipo_negocio_check;

ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_tipo_negocio_check CHECK (tipo_negocio IN (
  'traspaso_compra',
  'promocion_venta',
  'solo_tramite',
  'construccion',
  'construccion-impermeabilizacion',
  'construccion-remodelacion',
  'construccion-piso-estampado',
  'construccion-mantenimiento-postventa',
  'construccion-mantenimiento-cisternas',
  'construccion-mantenimiento-tinacos',
  'construccion-herreria',
  'otro'
));

COMMIT;
