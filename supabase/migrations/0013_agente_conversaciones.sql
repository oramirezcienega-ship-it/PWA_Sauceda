-- ============================================================
-- CONVERSACIONES: identificar quién atiende cada chat
-- ------------------------------------------------------------
-- Guarda el nombre del usuario (asesor) que envió cada respuesta saliente.
-- Así se puede mostrar "quién atiende" una conversación y dejar trazabilidad
-- de quién respondió, sin impedir que cualquier usuario participe.
-- ============================================================

alter table public.mensajes_whatsapp
  add column if not exists agente text not null default '';
