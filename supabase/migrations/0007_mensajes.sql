-- ============================================================
-- MÓDULO: MENSAJES
-- ------------------------------------------------------------
-- mensajes: plantillas de mensajes reutilizables (título + texto).
-- mensajes_enviados: un mensaje enviado a un expediente; aparece en el
-- portal del cliente. Admite parámetros del cliente en el texto.
-- ============================================================

create table if not exists public.mensajes (
  id         text primary key,        -- folio (MSG-001)
  titulo     text not null,
  texto      text not null default '',
  created_at timestamptz not null default now()
);
alter table public.mensajes enable row level security;

create table if not exists public.mensajes_enviados (
  id            uuid primary key default gen_random_uuid(),
  expediente_id text not null references public.expedientes(id) on delete cascade,
  titulo        text not null,
  texto         text not null default '',
  created_at    timestamptz not null default now()
);
alter table public.mensajes_enviados enable row level security;

create index if not exists mensajes_enviados_expediente_idx
  on public.mensajes_enviados (expediente_id);
