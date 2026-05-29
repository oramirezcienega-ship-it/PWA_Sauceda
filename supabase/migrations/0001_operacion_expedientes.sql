-- ============================================================
-- MÓDULO: OPERACIÓN  ·  Tabla: expedientes (traspasos INFONAVIT)
-- ------------------------------------------------------------
-- Cada módulo del BPM tiene sus propias tablas. Esta es la del
-- módulo de operación (el tablero de expedientes del admin).
-- Ejecuta este script en Supabase: SQL Editor → New query → Run.
-- ============================================================

create table if not exists public.expedientes (
  id               text primary key,                 -- folio legible (EXP-001)
  cliente          text not null,
  fraccionamiento  text not null,
  etapa            text not null default 'nuevo-lead'
                     check (etapa in (
                       'nuevo-lead','contactado','valuacion','oferta',
                       'documentos','notaria','cerrado'
                     )),
  situacion        text not null default '',
  telefono         text not null default '',
  valor_estimado   bigint not null default 0,
  saldo_deuda      bigint not null default 0,
  notas            text not null default '',          -- NOTAS INTERNAS (no se muestran al cliente)
  token            uuid not null default gen_random_uuid(), -- enlace privado del cliente
  ultimo_movimiento date not null default current_date,
  created_at       timestamptz not null default now()
);

-- Token único: es la "llave" del enlace de seguimiento del cliente.
create unique index if not exists expedientes_token_idx
  on public.expedientes (token);

-- ------------------------------------------------------------
-- Seguridad (RLS)
-- ------------------------------------------------------------
-- Activamos Row Level Security SIN políticas públicas: el navegador
-- nunca puede leer la tabla directamente. Todo el acceso pasa por el
-- servidor de Next.js usando la SERVICE ROLE KEY (que ignora RLS).
-- Cuando agreguemos login real, aquí entrarán las políticas por usuario.
alter table public.expedientes enable row level security;

-- ------------------------------------------------------------
-- Datos de ejemplo (mismos 6 expedientes del demo)
-- ------------------------------------------------------------
insert into public.expedientes
  (id, cliente, fraccionamiento, etapa, situacion, telefono, valor_estimado, saldo_deuda, ultimo_movimiento)
values
  ('EXP-001','María Guadalupe Hernández','Brisas del Campestre','nuevo-lead','Crédito al corriente, busca traspasar por cambio de ciudad.','477 123 4567',980000,410000,'2026-05-28'),
  ('EXP-002','José Antonio Ramírez','Villas de San Juan','contactado','Dos mensualidades atrasadas, quiere evitar embargo.','477 234 5678',720000,530000,'2026-05-27'),
  ('EXP-003','Laura Patricia Méndez','Punta del Este','valuacion','Crédito al corriente, inmueble en buen estado.','477 345 6789',1250000,295000,'2026-05-26'),
  ('EXP-004','Carlos Eduardo Torres','San Pedro de los Hernández','oferta','Interesado en vender rápido, urge liquidez.','477 456 7890',845000,380000,'2026-05-25'),
  ('EXP-005','Ana Sofía Gutiérrez','Valle de Señora','documentos','Aceptó oferta. Recopilando documentación.','477 567 8901',1100000,260000,'2026-05-24'),
  ('EXP-006','Roberto Carlos Aguilar','Joyas del Castillo','notaria','Documentación completa, trámite en notaría.','477 678 9012',690000,175000,'2026-05-23')
on conflict (id) do nothing;
