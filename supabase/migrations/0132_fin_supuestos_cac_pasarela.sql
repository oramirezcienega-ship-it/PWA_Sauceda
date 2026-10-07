-- Marketing por línea como CAC (costo de adquisición por cliente/operación)
-- y comisión de pasarela (% sobre ingreso) como variables de cada línea.

ALTER TABLE public.fin_supuestos_mes
  ADD COLUMN IF NOT EXISTS cac numeric,
  ADD COLUMN IF NOT EXISTS pct_comision_pasarela numeric;

-- Convertir el gasto de ads capturado a CAC = gasto / operaciones del mes
-- (solo donde hay operaciones; si no, se conserva el gasto como respaldo del motor)
WITH ops AS (
  SELECT
    s.id,
    s.gasto_ads,
    CASE
      WHEN l.modelo = 'manual' THEN COALESCE(s.operaciones_manual, 0)
      ELSE COALESCE(s.leads, 0)
        * (CASE WHEN s.pct_a_cotizacion > 1 THEN s.pct_a_cotizacion / 100 ELSE COALESCE(s.pct_a_cotizacion, 0) END)
        * (CASE WHEN s.pct_cierre > 1 THEN s.pct_cierre / 100 ELSE COALESCE(s.pct_cierre, 0) END)
    END AS operaciones
  FROM public.fin_supuestos_mes s
  JOIN public.fin_lineas_plan l ON l.id = s.linea_id
  WHERE s.cac IS NULL AND s.gasto_ads IS NOT NULL
)
UPDATE public.fin_supuestos_mes s
SET cac = CASE WHEN ops.gasto_ads = 0 THEN 0 ELSE ROUND(ops.gasto_ads / ops.operaciones, 2) END,
    gasto_ads = NULL,
    costo_por_lead = NULL
FROM ops
WHERE s.id = ops.id AND (ops.operaciones > 0 OR ops.gasto_ads = 0);
