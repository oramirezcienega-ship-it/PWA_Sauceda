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
3. En **Netlify**, agrega esas mismas dos variables en
   *Site settings → Environment variables* y vuelve a desplegar.

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
