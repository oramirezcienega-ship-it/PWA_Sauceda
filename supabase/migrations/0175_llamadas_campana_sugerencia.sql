-- ============================================================
-- LLAMADAS IA: bandeja de llamadas sugeridas
-- ------------------------------------------------------------
-- Las filas en 'pendiente' son sugerencias. La IA lee la cotización
-- y la conversación de WhatsApp y propone prioridad, hora y el gancho
-- con que Sofía abre la llamada. Al aprobar, la hora sugerida pasa a
-- proximo_intento y el despachador la marca a esa hora.
-- ============================================================

alter table public.llamadas_campana
  add column if not exists prioridad       text check (prioridad is null or prioridad in ('alta','media','baja')),
  add column if not exists puntaje         integer,                -- 0–100, ordena la bandeja
  add column if not exists hora_sugerida   timestamptz,
  add column if not exists sugerencia      jsonb,                  -- razon, gancho, objecion, hora_razon…
  add column if not exists analizada_at    timestamptz;

create index if not exists idx_llamadas_campana_bandeja
  on public.llamadas_campana (estado, puntaje desc nulls last);
