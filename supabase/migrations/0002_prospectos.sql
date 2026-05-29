-- ============================================================
-- MÓDULO: PROSPECTOS  ·  Tabla: prospectos (CRM de personas)
-- ------------------------------------------------------------
-- La persona es la entidad central; los expedientes se cuelgan de ella
-- (un prospecto puede tener varios expedientes). Incluye datos de
-- contacto y de adquisición (origen + valor de campaña).
-- Ejecuta este script en Supabase: SQL Editor → New query → Run.
-- ============================================================

create table if not exists public.prospectos (
  id             text primary key,                  -- folio legible (PRO-001)
  nombre         text not null,
  telefono       text not null default '',
  correo         text not null default '',
  direccion      text not null default '',
  ciudad         text not null default '',
  origen         text not null default 'otro'
                   check (origen in (
                     'whatsapp','facebook','instagram','recomendacion',
                     'sitio-web','volante','otro'
                   )),
  valor_campana  bigint not null default 0,         -- costo/valor de adquisición (MXN)
  notas          text not null default '',
  created_at     timestamptz not null default now()
);

alter table public.prospectos enable row level security;

-- ------------------------------------------------------------
-- Enlace: cada expediente pertenece (opcionalmente) a un prospecto.
-- ------------------------------------------------------------
alter table public.expedientes
  add column if not exists prospecto_id text
    references public.prospectos(id) on delete set null;

-- ------------------------------------------------------------
-- Migración: crea un prospecto por cada expediente existente que aún
-- no tenga prospecto, y los enlaza. Idempotente (continúa el folio).
-- ------------------------------------------------------------
do $$
declare
  r record;
  nuevo_id text;
  n int;
begin
  select coalesce(
    max(cast(regexp_replace(id, '\D', '', 'g') as int)), 0
  ) into n
  from public.prospectos;

  for r in
    select id, cliente, telefono
    from public.expedientes
    where prospecto_id is null
    order by id
  loop
    n := n + 1;
    nuevo_id := 'PRO-' || lpad(n::text, 3, '0');
    insert into public.prospectos (id, nombre, telefono, origen)
    values (nuevo_id, r.cliente, r.telefono, 'otro');
    update public.expedientes set prospecto_id = nuevo_id where id = r.id;
  end loop;
end $$;
