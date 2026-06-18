# SAUCEDA · Estructura de Base de Datos para Dashboard CRM

Este documento detalla el esquema de base de datos esperado por el **Dashboard CRM SAUCEDA**. El panel implementa una **estrategia de fallback automático**: si las tablas del esquema estándar (`leads`, `conversations`, `messages`) no se encuentran en la base de datos de Supabase, recurrirá al esquema local del BPM (`prospectos`, `expedientes`, `mensajes_whatsapp`).

---

## 1. Esquema Estándar (Recomendado para producción)

Si deseas utilizar el esquema base estructurado para el CRM, ejecuta la siguiente declaración de SQL en el panel de **SQL Editor** de tu proyecto Supabase para crear las tablas necesarias:

```sql
-- 1. TABLA LEADS (Contactos capturados desde Meta Ads y otras fuentes)
create table if not exists public.leads (
  id          text primary key, -- Folio legible (ej. LEAD-001) o UUID
  name        text not null,     -- Nombre completo del lead
  phone       text not null,     -- Teléfono de contacto (con clave de país)
  source      text not null default 'otro'
                check (source in ('whatsapp', 'facebook', 'instagram', 'sitio-web', 'recomendacion', 'otro')),
  created_at  timestamptz not null default now()
);

alter table public.leads enable row level security;
-- Añadir políticas RLS según corresponda (el dashboard corre en el servidor y evade RLS con service role)

-- 2. TABLA CONVERSATIONS (Estado de seguimiento con cada Lead)
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  lead_id     text not null references public.leads(id) on delete cascade,
  status      text not null default 'sin contactar'
                check (status in ('sin contactar', 'en proceso', 'calificado', 'perdido')),
  qualified   text not null default 'amarillo'
                check (qualified in ('verde', 'amarillo', 'rojo')),
  created_at  timestamptz not null default now()
);

alter table public.conversations enable row level security;
create index if not exists conversations_lead_idx on public.conversations(lead_id);

-- 3. TABLA MESSAGES (Mensajes individuales en cada conversación)
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')), -- user = Cliente, assistant = Sofía/Asesor
  text            text not null,
  created_at      timestamptz not null default now()
);

alter table public.messages enable row level security;
create index if not exists messages_conversation_idx on public.messages(conversation_id);
```

---

## 2. Esquema Fallback (Tablas locales del BPM)

Si decides no crear las tablas del esquema estándar, el dashboard detectará automáticamente su ausencia y usará las tablas preexistentes del BPM de Traspasos. La correspondencia lógica de datos es la siguiente:

| Concepto del Dashboard | Columna en Esquema Fallback | Notas de Mapeo |
| :--- | :--- | :--- |
| **Leads** | Tabla `public.prospectos` | Combina `nombre`, `primer_apellido` y `segundo_apellido` para armar el nombre. El canal viene de `origen`. |
| **Conversations** | Tabla `public.expedientes` | Conecta con el prospecto vía `prospecto_id`. El estatus del lead se deduce de `etapa` (`cerrado` $\rightarrow$ calificado, `perdido` $\rightarrow$ perdido). El semáforo es verde si está `cerrado`, rojo si está `perdido`, amarillo en cualquier otro caso. |
| **Messages** | Tabla `public.mensajes_whatsapp` | Se agrupa por teléfono o expediente. `direccion = 'in'` $\rightarrow$ `role = 'user'`, `direccion = 'out'` $\rightarrow$ `role = 'assistant'`. |

---

## 3. Variables de Entorno en `.env.local`

Para conectar el Dashboard con Supabase, asegúrate de configurar estas variables en tu archivo `.env.local` (local) y en los ajustes de Netlify/Vercel (producción):

```bash
# Variables del Servidor (Para saltarse el RLS y hacer las queries del CRM)
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-secreta

# Variables Públicas (Requeridas para el login de Supabase Auth)
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
```

---

## 4. Instrucciones para Despliegue en Vercel (1 Comando)

Para desplegar este dashboard y el BPM completo a Vercel con un solo comando, instala Vercel CLI globalmente y ejecuta el deploy:

```bash
# 1. Instalar Vercel CLI (si no lo tienes)
npm install -g vercel

# 2. Desplegar en producción vinculando el proyecto y las variables de entorno
vercel --prod
```

Durante el primer despliegue, el CLI te pedirá vincular el proyecto y te guiará para configurar las variables de entorno (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.).
