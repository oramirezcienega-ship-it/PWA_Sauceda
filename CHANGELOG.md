# Changelog — PWA SAUCEDA

Versionado: inicia en **1.001** y sube **+0.001** por cada versión publicada.
Formato: `versión — resumen breve — dd/mm/aa`.

## 1.004 — Evitar formularios duplicados — 29/05/26
- Al enviar un formulario ya pendiente al mismo cliente, se avisa y no se
  duplica (causa de que un formulario "siguiera apareciendo" tras retirar
  solo una de las copias).

## 1.003 — Subir PDF y fotos en los formularios — 29/05/26
- Nuevo tipo de pregunta "Archivo (PDF/foto)".
- El cliente puede subir archivos desde su portal (bucket privado de
  Supabase Storage); el admin los ve con URL firmada temporal.
- Migración 0005 crea el bucket de Storage.

## 1.002 — Sincronizar nombre, respuestas junto a campos y retirar formularios — 29/05/26
- Al cambiar el nombre del cliente en el expediente, se actualiza también
  el nombre del prospecto enlazado.
- El bloque de formularios (y sus respuestas) se muestra junto a los campos
  del expediente.
- Se puede retirar (eliminar) un formulario enviado al cliente.

## 1.001 — Columnas ordenables, versionado y portal sin lista de etapas — 29/05/26
- Ordenamiento por columna (ascendente/descendente) en el panel de
  expedientes y en el de prospectos (clic en el encabezado).
- Se establece el esquema de versionado del proyecto.
- Portal del cliente: se quita la sección "Etapas del traspaso" del enlace
  que se le comparte (conserva la etapa actual y el avance).
