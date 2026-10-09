-- Migration 0139: Asesoría de compra — Fase 4 (portal del cliente "Tus opciones")
-- ============================================================
-- La visita que agenda el cliente desde su portal queda ligada a la propuesta.
-- El portal (/seguimiento/[token]) lee y escribe solo vía server actions que
-- validan `expedientes.token`; no se abre acceso anon a ninguna tabla.
-- Sin DROP: idempotente.
-- ============================================================

ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS propuesta_id uuid REFERENCES public.propuestas_inmuebles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agenda_citas_propuesta_idx
  ON public.agenda_citas(propuesta_id) WHERE propuesta_id IS NOT NULL;

COMMENT ON COLUMN public.agenda_citas.propuesta_id IS 'Visita a un inmueble propuesto al comprador (asesoría de compra).';
