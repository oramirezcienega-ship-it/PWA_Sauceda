# Reglas de Comportamiento - PWA SAUCEDA

* **Políticas de Git y Ramas**:
  * **NUNCA** empujar (`push`) directamente a la rama `main`.
  * Todos los cambios de código, confirmaciones y empujes deben realizarse estrictamente en la rama `dev` (o ramas de características que deriven de ella).
  * El usuario se encargará de realizar el merge de `dev` a `main` y detonar el despliegue final.

* **Sincronización de Base de Datos y Migraciones en Staging**:
  * Siempre que se creen o modifiquen migraciones SQL o cambios en el esquema de base de datos en `supabase/migrations/`, verificar y asegurar activamente que las adecuaciones queden aplicadas en el entorno de Staging (utilizando las credenciales configuradas en `.env.local`) para garantizar que Staging se mantenga 100% compatible con los nuevos desarrollos.

* **Arquitectura de Next.js (Evitar fallos de compilación)**:
  * **Exclusividad de Enrutador:** Al crear o migrar componentes interactivos para usarse bajo el App Router (`src/app/`), **NUNCA** guardes el archivo de componente bajo la carpeta `src/pages/`. Muévelo a `src/components/` o directamente a `src/app/` para evitar conflicto de rutas duplicadas en Next.js.
  * **Interactividad en App Router:** Asegúrate de agregar la directiva `"use client";` al principio de todos los componentes que usen React hooks (`useState`, `useEffect`, `useTransition`, etc.) y que se importen en páginas del App Router.

* **Compatibilidad con Base de Datos de Supabase**:
  * **Columnas Obligatorias (NOT NULL):** En inserciones o ediciones de base de datos, en lugar de pasar `null` para campos de texto vacíos (como apellidos), pasa una cadena de texto vacía `""` si la columna tiene restricción `NOT NULL` en PostgreSQL.
  * **Mapeo de Campos de Contacto:** Asegúrate de mapear `email` a la columna **`correo`** en la base de datos.
  * **Restricciones CHECK:** Asegúrate de cumplir con los valores permitidos del check constraint de orígenes y estatus en `prospectos` (ej. usar `'otro'` en lugar de `'manual'`).

