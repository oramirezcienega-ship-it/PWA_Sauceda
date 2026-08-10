-- ============================================================
-- MIGRACIÓN 0064: Métricas de Rendimiento Automático por API
-- ============================================================

alter table public.publicaciones_programadas 
add column if not exists inversion_ads numeric default 0,
add column if not exists impresiones integer default 0,
add column if not exists clics integer default 0,
add column if not exists leads_generados integer default 0,
add column if not exists cpl numeric default 0,
add column if not exists roi_score numeric default 0,
add column if not exists meta_ad_id text;

-- Índice para acelerar la consulta del Agente de IA sobre las publicaciones de mayor rendimiento
create index if not exists publicaciones_programadas_cpl_idx on public.publicaciones_programadas(cpl) where estado = 'publicado';
