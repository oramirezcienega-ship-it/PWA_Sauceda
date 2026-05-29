-- ================================================================
-- TODAS LAS MIGRACIONES (0002 a 0007) — pegar y correr de una vez
-- Seguro de correr aunque ya hayas aplicado algunas (idempotente).
-- ================================================================

-- ===== supabase/migrations/0002_prospectos.sql =====
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

-- ===== supabase/migrations/0003_etapa_perdido.sql =====
-- ============================================================
-- Etapa adicional: "perdido" (lead/traspaso que no prosperó)
-- ============================================================
alter table public.expedientes
  drop constraint if exists expedientes_etapa_check;

alter table public.expedientes
  add constraint expedientes_etapa_check check (etapa in (
    'nuevo-lead','contactado','valuacion','oferta',
    'documentos','notaria','cerrado','perdido'
  ));

-- ===== supabase/migrations/0004_formularios.sql =====
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

-- ===== supabase/migrations/0005_storage_formularios.sql =====
-- ============================================================
-- Storage para archivos de formularios (PDF / fotos)
-- ------------------------------------------------------------
-- Bucket privado. La subida y la lectura pasan por el servidor con la
-- service role key (que ignora las políticas de Storage). El admin ve los
-- archivos mediante URLs firmadas temporales.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('formularios', 'formularios', false)
on conflict (id) do nothing;

-- ===== supabase/migrations/0006_separar_nombre.sql =====
-- ============================================================
-- Separar el nombre: nombre / primer_apellido / segundo_apellido
-- en prospectos y expedientes. El "nombre completo" se arma en la app.
-- ============================================================

alter table public.prospectos
  add column if not exists primer_apellido text not null default '';
alter table public.prospectos
  add column if not exists segundo_apellido text not null default '';

alter table public.expedientes
  add column if not exists primer_apellido text not null default '';
alter table public.expedientes
  add column if not exists segundo_apellido text not null default '';

-- Separación best-effort de los datos existentes (solo filas sin apellidos):
-- toma el último token como segundo apellido, el penúltimo como primero, y
-- el resto como nombre(s). El asesor puede corregir luego.
do $$
declare
  r record;
  w text[];
  n int;
begin
  for r in
    select id, nombre from public.prospectos
    where primer_apellido = '' and position(' ' in btrim(nombre)) > 0
  loop
    w := regexp_split_to_array(btrim(r.nombre), '\s+');
    n := array_length(w, 1);
    if n >= 3 then
      update public.prospectos set
        nombre = array_to_string(w[1:n-2], ' '),
        primer_apellido = w[n-1],
        segundo_apellido = w[n]
      where id = r.id;
    elsif n = 2 then
      update public.prospectos set nombre = w[1], primer_apellido = w[2]
      where id = r.id;
    end if;
  end loop;

  for r in
    select id, cliente from public.expedientes
    where primer_apellido = '' and position(' ' in btrim(cliente)) > 0
  loop
    w := regexp_split_to_array(btrim(r.cliente), '\s+');
    n := array_length(w, 1);
    if n >= 3 then
      update public.expedientes set
        cliente = array_to_string(w[1:n-2], ' '),
        primer_apellido = w[n-1],
        segundo_apellido = w[n]
      where id = r.id;
    elsif n = 2 then
      update public.expedientes set cliente = w[1], primer_apellido = w[2]
      where id = r.id;
    end if;
  end loop;
end $$;

-- ===== supabase/migrations/0007_mensajes.sql =====
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

-- ===== supabase/migrations/0008_actividades.sql =====
-- ============================================================
-- MÓDULO: ACTIVIDADES (bitácora / timeline)
-- ------------------------------------------------------------
-- Registra eventos relacionados con un expediente y/o prospecto:
-- mensajes, formularios, llamadas, correos, notas, cambios de etapa, etc.
-- ============================================================

create table if not exists public.actividades (
  id            uuid primary key default gen_random_uuid(),
  expediente_id text references public.expedientes(id) on delete cascade,
  prospecto_id  text references public.prospectos(id) on delete cascade,
  tipo          text not null,
  titulo        text not null,
  detalle       text not null default '',
  created_at    timestamptz not null default now()
);
alter table public.actividades enable row level security;

create index if not exists actividades_expediente_idx
  on public.actividades (expediente_id);
create index if not exists actividades_prospecto_idx
  on public.actividades (prospecto_id);

-- ===== supabase/migrations/0009_atribucion_campana.sql =====
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

