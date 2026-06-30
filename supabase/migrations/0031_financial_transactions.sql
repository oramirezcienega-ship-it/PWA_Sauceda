-- ============================================================
-- MÓDULO: TORRE DE CONTROL · Tablas Financieras y P&L
-- ------------------------------------------------------------
-- Registra los ingresos (ventas, comisiones) y egresos (marketing, nóminas, rentas, etc.)
-- del negocio para generar el Estado de Resultados consolidado.
-- ============================================================

create table if not exists public.transacciones_financieras (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  tipo          text not null check (tipo in ('ingreso', 'gasto')),
  categoria     text not null,
  concepto      text not null,
  monto         numeric(12,2) not null check (monto >= 0),
  expediente_id text references public.expedientes(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Indexar por fecha para filtros de rango rápidos
create index if not exists transacciones_financieras_fecha_idx on public.transacciones_financieras(fecha);

-- Habilitar Row Level Security (RLS)
alter table public.transacciones_financieras enable row level security;
