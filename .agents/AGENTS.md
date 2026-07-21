# Reglas de Comportamiento - PWA SAUCEDA

* **Políticas de Git y Ramas**:
  * **NUNCA** empujar (`push`) directamente a la rama `main`.
  * Todos los cambios de código, confirmaciones y empujes deben realizarse estrictamente en la rama `dev` (o ramas de características que deriven de ella).
  * El usuario se encargará de realizar el merge de `dev` a `main` y detonar el despliegue final.

* **Sincronización de Base de Datos y Migraciones en Staging**:
  * Siempre que se creen o modifiquen migraciones SQL o cambios en el esquema de base de datos en `supabase/migrations/`, verificar y asegurar activamente que las adecuaciones queden aplicadas en el entorno de Staging (utilizando las credenciales configuradas en `.env.local`) para garantizar que Staging se mantenga 100% compatible con los nuevos desarrollos.
