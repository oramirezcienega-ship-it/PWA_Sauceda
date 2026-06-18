-- ============================================================
-- MÓDULO: CONFIGURACIÓN DEL AGENTE
-- ------------------------------------------------------------
-- Permite almacenar configuraciones personalizadas del agente IA,
-- como indicaciones adicionales, comportamiento y reglas sin necesidad
-- de re-desplegar la aplicación.
-- ============================================================

create table if not exists public.configuracion_agente (
  clave       text primary key,
  valor       text not null,
  updated_at  timestamptz not null default now()
);

-- Insertar por defecto la fila de instrucciones adicionales vacía si no existe
insert into public.configuracion_agente (clave, valor)
values ('ia_instrucciones', '')
on conflict (clave) do nothing;

-- Habilitar RLS
alter table public.configuracion_agente enable row level security;
