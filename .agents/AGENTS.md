# Reglas de Comportamiento y Protecciones - PWA SAUCEDA

* **Candado de Protección Absoluta para Sofía (IA) y Scripts de Bienvenida / Captación**:
  * **PROHIBICIÓN ESTRICTA:** Queda strictly prohibido alterar, modificar, recortar o cambiar la lógica de respuesta, scripts de bienvenida, prompts del sistema de Sofía (`src/lib/ia/agente.ts`), o reglas de clasificación de negocio (`detectarTipoNegocio`) como efecto secundario de tareas de UI, diseño, visualización de expediente o tableros del CRM.
  * **VERIFICACIÓN DE IMPACTO OBLIGATORIA:** Ningún cambio visual en formularios, expedientes o prospectos debe alterar las columnas, variables o propiedades que Sofía utiliza para construir su contexto conversacional y atender a los clientes.
  * **SOLICITUD DE CONFIRMACIÓN AL USUARIO:** Si una tarea requiere explícitamente modificar el comportamiento, prompts o scripts de Sofía, el asistente **DEBE DETENERSE Y PEDIR CONFIRMACIÓN EXPLÍCITA AL USUARIO PRIMERO**, explicando detalladamente el cambio y su impacto antes de tocar cualquier archivo de la IA.

* **Políticas de Git y Ramas**:
  * **NUNCA** empujar (`push`) directamente a la rama `main`.
  * **AUTO PUSH A DEV OBLIGATORIO:** Siempre que se complete y valide una tarea, corrección o funcionalidad, realizar automáticamente el `git add`, `git commit` y `git push origin dev` sin necesidad de que el usuario lo solicite.
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

* **Privacidad y Datos de Producción en Staging**:
  * **NUNCA** realizar sincronizaciones o copias directas de datos de producción reales hacia la base de datos de Staging sin anonimizarlos inmediatamente después.
  * Si se realiza un respaldo o sincronización desde producción, se debe ejecutar inmediatamente el script `node scripts/anonymize-staging-db.js` para enmascarar los datos de clientes (nombres, teléfonos y mensajes) y garantizar que Staging nunca almacene información real de producción desprotegida.
