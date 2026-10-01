-- ============================================================
-- Migración 0121: Marcar citas cuya comisión de inspección fue eliminada
-- ============================================================
-- Al eliminar una comisión de inspección, la auto-sincronización pasiva de
-- listarComisiones la volvía a crear en la siguiente recarga. Esta bandera
-- indica que el admin descartó la comisión de esa cita y no debe regenerarse
-- automáticamente (solo al marcar de nuevo la inspección como ejecutada).

ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS comision_descartada BOOLEAN NOT NULL DEFAULT FALSE;
