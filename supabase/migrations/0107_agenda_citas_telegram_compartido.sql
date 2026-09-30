-- ============================================================
-- Migración 0107: agenda_citas.telegram_compartido
-- ============================================================
-- Guarda, por asesor, si la información de la inspección se compartió por
-- Telegram y si el asesor confirmó que la leyó (botón "Enterado").
-- Estructura: { "<perfil_id>": { nombre, ok, enviadoAt, messageId, error,
--                                enteradoAt, enteradoVia } }

ALTER TABLE public.agenda_citas
  ADD COLUMN IF NOT EXISTS telegram_compartido JSONB NOT NULL DEFAULT '{}'::jsonb;
