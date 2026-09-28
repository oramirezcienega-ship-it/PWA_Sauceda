-- ============================================================
-- Migración 0099: Base Comisionable en Comisiones de Asesores
-- ============================================================
-- La comisión del asesor debe calcularse sobre la utilidad neta de
-- SAUCEDA (precio de venta - costo del proveedor/subcontratista -
-- comisión bancaria/pasarela de pago cuando aplique), no sobre el
-- precio de venta completo.

ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS costo_proveedor    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS comision_bancaria  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS base_comisionable  NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- Backfill: por ahora igualamos la base comisionable al monto de venta
-- existente (costo_proveedor y comision_bancaria en 0) para las filas ya
-- creadas; se recalculan correctamente la próxima vez que se sincronicen
-- desde "Sincronizar Remisiones Ahora" o al registrar una nueva venta.
UPDATE public.comisiones
SET base_comisionable = monto_venta
WHERE base_comisionable = 0.00;
