-- ============================================================
-- LLAMADAS IA: segmentos con objetivo propio
-- ------------------------------------------------------------
-- Cada sugerencia queda en un segmento del embudo y la llamada
-- cambia de objetivo según él:
--   sin_respuesta  → reconectar y saber qué pasó
--   sin_cotizar    → completar datos para que el asesor cotice
--   cotizado       → resolver dudas y coordinar la visita
--   no_interesado  → no llamar
-- Resultado nuevo 'cotizar': dio sus datos y espera su cotización.
-- ============================================================

alter table public.llamadas_campana
  add column if not exists segmento text
    check (segmento is null or segmento in ('sin_respuesta','sin_cotizar','cotizado','no_interesado'));

ALTER TABLE public.llamadas_campana DROP CONSTRAINT IF EXISTS llamadas_campana_resultado_check;
ALTER TABLE public.llamadas_campana ADD CONSTRAINT llamadas_campana_resultado_check
  CHECK (resultado IS NULL OR resultado IN (
    'visita_agendada','cotizar','interesado','transferido','duda','no_interesado',
    'llamar_despues','no_contesta','buzon','no_llamar','error'
  ));
