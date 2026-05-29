-- ============================================================
-- MÓDULO: FORMULARIOS
-- ------------------------------------------------------------
-- formularios: plantillas reutilizables (título + preguntas en JSON).
-- envios_formulario: una plantilla enviada a un expediente, con las
-- respuestas del cliente. El cliente responde desde su portal de
-- seguimiento (mismo enlace por token del expediente).
-- ============================================================

create table if not exists public.formularios (
  id          text primary key,                 -- folio (FORM-001)
  titulo      text not null,
  descripcion text not null default '',
  preguntas   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.formularios enable row level security;

create table if not exists public.envios_formulario (
  id            uuid primary key default gen_random_uuid(),
  formulario_id text not null references public.formularios(id) on delete cascade,
  expediente_id text not null references public.expedientes(id) on delete cascade,
  estado        text not null default 'pendiente'
                  check (estado in ('pendiente','respondido')),
  respuestas    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  respondido_at timestamptz
);
alter table public.envios_formulario enable row level security;

create index if not exists envios_formulario_expediente_idx
  on public.envios_formulario (expediente_id);
