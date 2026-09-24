-- Migration 0088: Reparar restricción check de tipo_negocio en expedientes
-- ============================================================
-- En producción la restricción quedó desactualizada (no se aplicaron todas
-- las migraciones 0035/0043/0066/0078) y el alta de expedientes con líneas de
-- "Sauceda Construye" fallaba con:
--   new row for relation "expedientes" violates check constraint
--   "expedientes_tipo_negocio_check"
-- Esta migración es idempotente: se puede ejecutar aunque ya estén aplicadas.
-- Debe coincidir con TipoNegocioId en src/lib/types.ts.

BEGIN;

ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_tipo_negocio_check;

-- Cualquier valor fuera del catálogo pasa a 'otro' para no bloquear la restricción.
UPDATE public.expedientes
SET tipo_negocio = 'otro'
WHERE tipo_negocio IS NULL OR tipo_negocio NOT IN (
  'traspaso_compra',
  'promocion_venta',
  'solo_tramite',
  'construccion',
  'construccion-impermeabilizacion',
  'construccion-remodelacion',
  'construccion-piso-estampado',
  'construccion-mantenimiento-postventa',
  'construccion-herreria',
  'otro'
);

ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_tipo_negocio_check CHECK (tipo_negocio IN (
  'traspaso_compra',                      -- Traspaso o compra de casa
  'promocion_venta',                     -- Promoción de venta de casa
  'solo_tramite',                        -- Solo trámite
  'construccion',                        -- Sauceda Construye (General)
  'construccion-impermeabilizacion',      -- Sauceda Construye - Impermeabilización
  'construccion-remodelacion',            -- Sauceda Construye - Remodelación
  'construccion-piso-estampado',         -- Sauceda Construye - Piso Estampado
  'construccion-mantenimiento-postventa', -- Sauceda Construye - Mantenimiento Postventa
  'construccion-herreria',               -- Sauceda Construye - Herrería
  'otro'
));

COMMIT;
