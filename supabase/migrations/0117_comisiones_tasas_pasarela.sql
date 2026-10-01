-- ============================================================
-- Migración 0117: Tasas de Pasarela / Terminal parametrizables
-- ============================================================
-- Las sugerencias de "Costo Financiero" en el detalle de la remisión
-- (Clip, Bancaria, etc.) se configuran como reglas tipo 'pasarela'
-- en comisiones_reglas. El campo porcentaje es la tasa efectiva
-- (con IVA) que se aplica sobre el total de la remisión.

ALTER TABLE public.comisiones_reglas
  DROP CONSTRAINT IF EXISTS comisiones_reglas_tipo_check;

ALTER TABLE public.comisiones_reglas
  ADD CONSTRAINT comisiones_reglas_tipo_check
  CHECK (tipo IN ('global', 'servicio', 'producto', 'asesor', 'inspeccion', 'pasarela'));

INSERT INTO public.comisiones_reglas (tipo, clave, etiqueta, porcentaje, monto_fijo, activo, notas)
SELECT 'pasarela', 'clip', 'Clip', 4.18, 0.00, true, '3.6% Clip + IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM public.comisiones_reglas WHERE tipo = 'pasarela' AND clave = 'clip'
);

INSERT INTO public.comisiones_reglas (tipo, clave, etiqueta, porcentaje, monto_fijo, activo, notas)
SELECT 'pasarela', 'bancaria', 'Bancaria', 3.50, 0.00, true, 'Terminal bancaria'
WHERE NOT EXISTS (
  SELECT 1 FROM public.comisiones_reglas WHERE tipo = 'pasarela' AND clave = 'bancaria'
);
