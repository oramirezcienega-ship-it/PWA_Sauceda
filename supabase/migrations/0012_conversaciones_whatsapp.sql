-- ============================================================
-- MÓDULO: CONVERSACIONES DE WHATSAPP (bandeja bidireccional)
-- ------------------------------------------------------------
-- Hilo de mensajes entrantes (del cliente, vía webhook) y salientes
-- (respuestas del asesor por la Cloud API), agrupados por teléfono y
-- enlazados al expediente / prospecto correspondiente.
-- ============================================================

create table if not exists public.mensajes_whatsapp (
  id             uuid primary key default gen_random_uuid(),
  expediente_id  text references public.expedientes(id) on delete set null,
  prospecto_id   text references public.prospectos(id) on delete set null,
  telefono       text not null,
  -- 'in'  = entrante (lo escribió el cliente)
  -- 'out' = saliente (lo enviamos nosotros)
  direccion      text not null check (direccion in ('in', 'out')),
  texto          text not null default '',
  -- id del mensaje en Meta (para evitar duplicados de entrantes).
  wa_message_id  text,
  -- estado del envío saliente: ''/'enviado'/'error'.
  estado         text not null default '',
  created_at     timestamptz not null default now()
);
alter table public.mensajes_whatsapp enable row level security;

create index if not exists mensajes_whatsapp_telefono_idx
  on public.mensajes_whatsapp (telefono, created_at desc);
create index if not exists mensajes_whatsapp_expediente_idx
  on public.mensajes_whatsapp (expediente_id);
-- Evita duplicar un mismo mensaje entrante si Meta reintenta el webhook.
create unique index if not exists mensajes_whatsapp_wamid_uniq
  on public.mensajes_whatsapp (wa_message_id)
  where wa_message_id is not null;
