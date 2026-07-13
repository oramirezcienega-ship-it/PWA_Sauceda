-- ============================================================
-- MÓDULO: EL CONSEJO (Toma de decisiones estratégicas con IA)
-- ------------------------------------------------------------
-- Tablas para evaluar proyectos, alternativas y asesores.
-- Acceso exclusivo a usuarios administradores.
-- ============================================================

-- 1. Tabla de Proyectos del Consejo
create table if not exists public.council_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  context     text not null,
  status      text not null default 'borrador' check (status in ('borrador', 'cerrado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Tabla de Alternativas Evaluadas (Consultas al Consejo)
create table if not exists public.council_alternatives (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.council_projects(id) on delete cascade,
  question    text not null,
  opinions    jsonb not null default '{}'::jsonb,
  verdict     text,
  admin_notes text,
  status      text not null default 'Pendiente revisión' check (status in ('Pendiente revisión', 'Descartada', 'Seleccionada')),
  created_at  timestamptz not null default now()
);

-- 3. Tabla de Especialistas (Asesores) asociados a cada proyecto
create table if not exists public.council_advisors (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.council_projects(id) on delete cascade,
  name        text not null,
  prompt      text not null,
  enabled     boolean not null default true,
  "order"     integer not null default 0,
  unique(project_id, name)
);

-- Habilitar Row Level Security (RLS)
alter table public.council_projects enable row level security;
alter table public.council_alternatives enable row level security;
alter table public.council_advisors enable row level security;

-- Políticas de Seguridad RLS: Solo administradores activos pueden acceder a estos datos
create policy "Administradores pueden gestionar council_projects"
  on public.council_projects for all
  to authenticated
  using (
    exists (
      select 1 from public.perfiles
      where perfiles.id = auth.uid()
      and perfiles.rol = 'admin'
      and perfiles.activo = true
    )
  );

create policy "Administradores pueden gestionar council_alternatives"
  on public.council_alternatives for all
  to authenticated
  using (
    exists (
      select 1 from public.perfiles
      where perfiles.id = auth.uid()
      and perfiles.rol = 'admin'
      and perfiles.activo = true
    )
  );

create policy "Administradores pueden gestionar council_advisors"
  on public.council_advisors for all
  to authenticated
  using (
    exists (
      select 1 from public.perfiles
      where perfiles.id = auth.uid()
      and perfiles.rol = 'admin'
      and perfiles.activo = true
    )
  );
