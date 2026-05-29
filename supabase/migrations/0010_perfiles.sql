-- ============================================================
-- MÓDULO: USUARIOS (perfiles y roles del equipo operativo)
-- ------------------------------------------------------------
-- Cada usuario de Supabase Auth tiene un perfil con su nombre, rol y estado.
-- Roles: 'admin' (gestiona usuarios y todo) · 'asesor' (opera, sin usuarios).
-- Nota: un usuario sin perfil se trata como admin (bootstrap del primero).
-- ============================================================

create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null default '',
  rol        text not null default 'asesor' check (rol in ('admin','asesor')),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.perfiles enable row level security;
