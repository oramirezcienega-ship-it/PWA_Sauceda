-- ============================================================
-- MÓDULO: CRM ANALÍTICO · Tabla: analisis_ia (Caché de análisis)
-- ------------------------------------------------------------
-- Guarda los análisis de conversaciones generados por Claude (IA).
-- Así se evita re-evaluar la misma conversación cada vez que se carga
-- el dashboard, optimizando el costo y velocidad.
-- ============================================================

create table if not exists public.analisis_ia (
  telefono           text primary key,                     -- Identificador único (teléfono del lead)
  resumen            text not null,                         -- Resumen de 2 líneas
  punto_de_quiebre   text not null,                         -- Mensaje/momento exacto del quiebre
  razon_perdida      text not null,                         -- Motivo principal por el que se perdió
  calidad_lead       text not null check (calidad_lead in ('alta', 'media', 'baja')), -- Semáforo de calidad
  recomendacion      text not null,                         -- Recomendación de script
  recuperable        boolean not null default false,        -- ¿Es recuperable comercialmente?
  created_at         timestamptz not null default now()    -- Fecha del análisis
);

-- Habilitar Row Level Security (RLS)
alter table public.analisis_ia enable row level security;

-- Nota: El servidor de Next.js opera con SERVICE ROLE bypassando RLS.
-- Si en el futuro se requiere lectura desde el navegador, se pueden crear políticas aquí.
