-- Migration 0105: Vincular cotizaciones con la cita de inspección técnica de la agenda
-- =========================================================================
-- Permite generar la cotización a partir de una inspección ya programada/realizada
-- en el expediente, en vez de programar una inspección nueva desde el módulo de cotizaciones.

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS cita_id UUID REFERENCES public.agenda_citas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cotizaciones_cita_idx ON public.cotizaciones(cita_id);
