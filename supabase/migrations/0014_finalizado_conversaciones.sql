-- ============================================================
-- CONVERSACIONES: estado finalizado de conversaciones
-- ------------------------------------------------------------
-- Agrega la columna finalizado a mensajes_whatsapp para marcar si
-- el chat ha sido resuelto/concluido.
-- ============================================================

alter table public.mensajes_whatsapp
  add column if not exists finalizado boolean not null default false;
