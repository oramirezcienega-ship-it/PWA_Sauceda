-- ============================================================
-- MIGRACIÓN 0032: Gastos Recurrentes e Insights Contextuales
-- ============================================================

-- 1. Agregar soporte para gastos recurrentes a transacciones_financieras
alter table public.transacciones_financieras 
add column if not exists es_recurrente boolean not null default false,
add column if not exists recurrente_parent_id uuid references public.transacciones_financieras(id) on delete cascade;

-- Crear índice para agilizar consultas de relaciones parentales
create index if not exists transacciones_financieras_recurrente_idx on public.transacciones_financieras(recurrente_parent_id);

-- 2. Agregar soporte para clasificar insights de Sofía (marketing / finanzas)
alter table public.dashboard_insights
add column if not exists tipo text not null default 'marketing';

-- Crear índice para búsqueda rápida por tipo
create index if not exists dashboard_insights_tipo_idx on public.dashboard_insights(tipo);
