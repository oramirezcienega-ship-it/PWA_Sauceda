# Changelog — PWA SAUCEDA

Versionado: inicia en **1.001** y sube **+0.001** por cada versión publicada.
Formato: `versión — resumen breve — dd/mm/aa`.

## 1.015 — Ajuste de texto (Valuación) — 29/05/26
- Etapa Valuación para el cliente: "Estamos evaluando tu propiedad…".

## 1.014 — Textos por etapa para el cliente — 29/05/26
- Cada etapa ahora tiene un texto propio para el cliente (nombre y
  descripción) en el portal, distinto del texto interno del asesor.
- "Perdido" se muestra como "En pausa" y oculta la barra de avance.

## 1.013 — Atribución de campaña (ad/adset/campaign) — 29/05/26
- Campos ad_name, adset_name y campaign_name en expedientes y prospectos,
  con sincronización bidireccional. Disponibles en los formularios, en la
  importación CSV y visibles en la ficha del prospecto. Migración 0009.

## 1.012 — Filtros de etapa (multi) y fecha en expedientes — 29/05/26
- Filtro de etapas con multi-selección (chips).
- Filtro por fecha de último movimiento: Hoy, Ayer, Últimos 7 días, Este mes,
  Mes pasado y rango Personalizado.

## 1.011 — Arreglo del mensaje de WhatsApp al cliente — 29/05/26
- El mensaje de WhatsApp ahora resuelve los parámetros ({nombre}, etc.) en
  vez de mandarlos literales, y ya no incluye el título (mejor experiencia).

## 1.010 — Zona de Actividades (bitácora) — 29/05/26
- Timeline de actividades en el detalle del expediente y del prospecto:
  creación, cambios de etapa, mensajes, formularios enviados/respondidos.
- Registro manual de actividades (notas, llamadas, correos, reuniones).
- Migración 0008 crea la tabla de actividades.

## 1.009 — Módulo de Mensajes — 29/05/26
- Panel de Mensajes: plantillas reutilizables (título + texto) con parámetros
  del cliente ({nombre}, etc.).
- En el expediente: enviar mensajes (desde plantilla o personalizados) que
  aparecen en el portal del cliente; retirar; y notificar por WhatsApp.
- Migración 0007 crea las tablas de mensajes.

## 1.008 — Logo de la marca — 29/05/26
- Logotipo SVG (public/logo.svg) en el encabezado, el login y el portal del
  cliente. Reemplazable por el logo oficial conservando el nombre del archivo.

## 1.007 — Sincronización bidireccional de campos compartidos — 29/05/26
- Los campos que comparten expediente y prospecto (nombre y teléfono) se
  reflejan en ambos: editar cualquiera actualiza al otro.

## 1.006 — Nombre separado y parámetros en formularios — 29/05/26
- El nombre se separa en Nombre / Primer apellido / Segundo apellido en
  expedientes y prospectos (migración 0006 separa lo existente). Las vistas
  muestran el nombre completo armado; la búsqueda usa el nombre completo.
- Al cambiar el nombre en el expediente se sincroniza el del prospecto.
- Los formularios admiten parámetros del cliente en su texto, ej.
  "Hola {nombre}" ({nombre}, {primer_apellido}, {segundo_apellido},
  {nombre_completo}, {fraccionamiento}).

## 1.005 — Fotos múltiples y elección cámara/galería en formularios — 29/05/26
- El campo de archivo permite subir varios a la vez y el celular ofrece
  cámara, galería o archivos (PDF). El admin ve cada archivo por separado.

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
