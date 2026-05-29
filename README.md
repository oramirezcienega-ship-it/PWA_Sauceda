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
- Datos mock / persistencia local (todavía sin backend)

## Cómo correrlo

```bash
npm install
npm run dev     # http://localhost:3000
```

## Incrementos

- **Incremento 1** — Scaffold PWA + tablero de expedientes (7 etapas) con datos mock.
- **Incremento 2** — Persistencia local (localStorage) + alta/edición/eliminación de expedientes.
