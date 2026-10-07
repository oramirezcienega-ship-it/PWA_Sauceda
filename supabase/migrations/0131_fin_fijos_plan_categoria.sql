-- Enlaza los gastos fijos proyectados con el catálogo de cuentas (categories)
-- para que cada concepto caiga en la misma cuenta/línea del P&L que usa Finanzas.

ALTER TABLE public.fin_fijos_plan
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_fijos_plan_categoria ON public.fin_fijos_plan(categoria_id);

-- Permitir todas las líneas de egreso del P&L (antes faltaba opex_comisiones_visitas y costos)
ALTER TABLE public.fin_fijos_plan DROP CONSTRAINT IF EXISTS fin_fijos_plan_linea_pnl_check;
ALTER TABLE public.fin_fijos_plan ADD CONSTRAINT fin_fijos_plan_linea_pnl_check CHECK (linea_pnl IN (
  'costo_directo',
  'costo_comisiones_venta',
  'costo_marketing',
  'opex_nomina',
  'opex_comisiones_visitas',
  'opex_renta',
  'opex_servicios',
  'opex_otros',
  'gastos_financieros',
  'isr'
));

-- Backfill: asignar la cuenta de egreso activa que corresponde a la línea P&L
UPDATE public.fin_fijos_plan f
SET categoria_id = c.id
FROM (
  SELECT DISTINCT ON (linea_pnl) id, linea_pnl
  FROM public.categories
  WHERE tipo = 'egreso' AND activo = true
  ORDER BY linea_pnl, created_at
) c
WHERE f.categoria_id IS NULL AND f.linea_pnl = c.linea_pnl;
