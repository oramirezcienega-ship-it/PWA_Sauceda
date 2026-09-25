-- Migration 0089: Actualizar restricción check de tipo_negocio en expedientes para incluir construcción-mantenimiento-cisternas
-- ============================================================

BEGIN;

ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_tipo_negocio_check;

ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_tipo_negocio_check CHECK (tipo_negocio IN (
  'traspaso_compra',                      -- Traspaso o compra de casa
  'promocion_venta',                     -- Promoción de venta de casa
  'solo_tramite',                        -- Solo trámite
  'construccion',                        -- Sauceda Construye (General)
  'construccion-impermeabilizacion',      -- Sauceda Construye - Impermeabilización
  'construccion-remodelacion',            -- Sauceda Construye - Remodelación
  'construccion-piso-estampado',         -- Sauceda Construye - Piso Estampado
  'construccion-mantenimiento-postventa', -- Sauceda Construye - Mantenimiento Postventa
  'construccion-mantenimiento-cisternas', -- Sauceda Construye - Mantenimiento Cisternas
  'construccion-herreria',               -- Sauceda Construye - Herrería
  'otro'
));

COMMIT;
