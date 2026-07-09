-- Migration 0037: Relacionar cotizaciones con expedientes e integrar flujo
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS expediente_id TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cotizaciones_expediente_idx ON public.cotizaciones(expediente_id);

-- Actualizar constraint de etapa en expedientes para incluir el flujo de construcción
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_etapa_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_etapa_check CHECK (etapa IN (
  'nuevo-lead', 'contactado', 'valuacion', 'oferta', 'documentos', 'notaria', 'cerrado', 'perdido',
  -- Nuevas etapas para flujo de construcción
  'interes', 'cotizacion', 'visita', 'propuesta-aceptada', 'venta'
));
