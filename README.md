# SAUCEDA · BPM de Traspasos INFONAVIT

PWA (Progressive Web App) que funciona como **motor de operación (BPM)** para
traspasos INFONAVIT de **SAUCEDA Bienes Raíces** (León, Gto., México).

> _Tradición con tecnología._

## Filosofía

Se construye **poco a poco**: incrementos pequeños, funcionales y demostrables.
Cada incremento entra a `main` mediante un Pull Request.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (tokens de marca)
- PWA instalable (manifest + service worker)
- **Supabase** como base de datos (acceso vía server actions, con service role)

## Configurar Supabase

1. En tu proyecto de Supabase, abre **SQL Editor** y ejecuta el script
   `supabase/migrations/0001_operacion_expedientes.sql` (crea la tabla
   `expedientes` y carga 6 registros de ejemplo).
2. Copia `.env.example` a `.env.local` y rellena:
   - `SUPABASE_URL` — Project Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role` (¡secreta!)
   - `NEXT_PUBLIC_SUPABASE_URL` — la misma Project URL (para el login)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API → `anon public`
3. En **Netlify**, agrega esas mismas variables en
   *Site settings → Environment variables* y vuelve a desplegar (sin caché).

## Acceso del admin (Supabase Auth)

El panel del admin requiere iniciar sesión; el portal del cliente
(`/seguimiento/[token]`) sigue siendo público.

1. Crea tu usuario del equipo en Supabase → **Authentication → Users →
   Add user** (correo + contraseña). No hay registro público.
2. Opcional pero recomendado: en **Authentication → Sign In / Providers**
   desactiva *Allow new users to sign up*.
3. Entra en `/login` con ese correo y contraseña.

> Cada módulo del BPM tiene sus propias tablas. Hoy existe el módulo de
> **operación** (`expedientes`); los módulos futuros (captación, documentos
> del cliente, etc.) agregarán las suyas con nuevas migraciones.

## Cómo correrlo

```bash
npm install
npm run dev     # http://localhost:3000
```

## Vistas

- **Admin / asesor:** `/` — tablero de operación (todos los expedientes).
- **Cliente vendedor:** `/seguimiento/[token]` — seguimiento de solo lectura
  de un expediente, por enlace privado.

## Incrementos

- **Incremento 1** — Scaffold PWA + tablero de expedientes (7 etapas) con datos mock.
- **Incremento 2** — Persistencia local (localStorage) + alta/edición/eliminación.
- **Incremento 3** — Supabase como base de datos real + portal del cliente
  (seguimiento de solo lectura por enlace privado).
- **Incremento 4** — Login del admin con Supabase Auth (middleware protege
  el panel; el portal del cliente queda público).
- **Incremento 5** — Vista de lista (tipo HubSpot) con selector Lista/Tablero.
- **Incremento 6** — Búsqueda (cliente/fraccionamiento) y filtro por etapa.
- **Incremento 7** — Captación de leads por WhatsApp (webhook Meta Cloud API).
- **Incremento 8** — Módulo de Prospectos (CRM): persona como entidad
  central, expedientes relacionados, origen y valor de campaña de adquisición.
