-- ============================================================
-- MÓDULO: TORRE DE CONTROL · Tablas de Analítica y Recomendaciones
-- ------------------------------------------------------------
-- Registra las métricas diarias agregadas de canales externos (Meta, TikTok, GA4)
-- y del CRM, así como los reportes de salud e insights generados por la IA ("Sofía").
-- ============================================================

-- 1. Tabla para consolidar métricas diarias de marketing y CRM
create table if not exists public.analytics_marketing (
  id                    uuid primary key default gen_random_uuid(),
  fecha                 date not null,
  canal                 text not null check (canal in ('facebook', 'instagram', 'tiktok', 'google-analytics', 'otro')),
  campana_id            text,
  campana_nombre        text,
  gasto_publicitario    numeric(10,2) default 0.00,
  impresiones           integer default 0,
  clics                 integer default 0,
  sesiones_web          integer default 0,
  leads_registrados_crm integer default 0,
  ventas_cerradas_crm   integer default 0,
  created_at            timestamptz not null default now()
);

-- Asegurar unicidad diaria por canal y campaña
create unique index if not exists analytics_marketing_fecha_canal_campana_idx 
on public.analytics_marketing(fecha, canal, coalesce(campana_id, ''));

-- Habilitar Row Level Security (RLS)
alter table public.analytics_marketing enable row level security;

-- 2. Tabla para almacenar recomendaciones e insights analíticos del cerebro (IA)
create table if not exists public.dashboard_insights (
  id                  uuid primary key default gen_random_uuid(),
  fecha               date not null default current_date,
  alertas             jsonb not null default '[]'::jsonb,      -- Alertas críticas (rojas)
  oportunidades       jsonb not null default '[]'::jsonb,      -- Oportunidades comerciales (amarillas)
  estado_salud        text not null,                           -- Resumen de salud general (verde)
  diagnostico_general text not null,                           -- Texto detallado del reporte
  created_at          timestamptz not null default now()
);

-- Indexar por fecha para búsquedas eficientes del reporte más reciente
create index if not exists dashboard_insights_fecha_idx on public.dashboard_insights(fecha);

-- Habilitar Row Level Security (RLS)
alter table public.dashboard_insights enable row level security;
