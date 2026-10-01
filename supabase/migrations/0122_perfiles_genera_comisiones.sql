-- ============================================================
-- Migración 0122: Qué usuarios generan comisiones
-- ============================================================
-- Solo los perfiles marcados generan comisiones por ventas (remisiones /
-- recibos) e inspecciones. Se configura desde Comisiones → Reglas.
-- Al inicio, solo Gerardo genera comisiones.

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS genera_comisiones BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.perfiles
   SET genera_comisiones = TRUE
 WHERE nombre = 'Gerardo' AND rol = 'asesor';
