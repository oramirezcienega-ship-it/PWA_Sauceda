-- ============================================================
-- Migración 0106: permitir la modalidad "obra_apu" en cotizaciones
-- ============================================================
-- La restricción cotizaciones_modalidad_check solo admitía 'estatica' y
-- 'modular', por lo que "Convertir a Presupuesto de Obra (APU)" fallaba al
-- guardar. La migración 0103 no la corrigió porque la columna ya existía.

ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_modalidad_check;
ALTER TABLE public.cotizaciones
  ADD CONSTRAINT cotizaciones_modalidad_check
  CHECK (modalidad IN ('estatica', 'modular', 'obra_apu'));
