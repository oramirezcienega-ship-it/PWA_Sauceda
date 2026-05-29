-- ============================================================
-- Campos de atribución de campaña (Meta) en prospectos y expedientes,
-- con sincronización bidireccional desde la app.
-- ============================================================

alter table public.prospectos
  add column if not exists ad_name text not null default '';
alter table public.prospectos
  add column if not exists adset_name text not null default '';
alter table public.prospectos
  add column if not exists campaign_name text not null default '';

alter table public.expedientes
  add column if not exists ad_name text not null default '';
alter table public.expedientes
  add column if not exists adset_name text not null default '';
alter table public.expedientes
  add column if not exists campaign_name text not null default '';
