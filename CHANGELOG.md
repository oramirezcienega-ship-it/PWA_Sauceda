# Changelog — PWA SAUCEDA

Versionado: inicia en **1.001** y sube **+0.001** por cada versión publicada.
Formato: `versión — resumen breve — dd/mm/aa`.

## 1.028 — Número de WhatsApp real del negocio — 29/05/26
- marca.ts: WhatsApp actualizado al número real (477 465 4700).

## 1.027 — Redes sociales reales en marca y correos — 29/05/26
- Se actualizan en src/lib/marca.ts las URLs reales de Facebook, TikTok e Instagram.
- El pie de correo ahora incluye también el enlace a Instagram.

## 1.026 — Dashboard general de la operación — 29/05/26
- Nueva sección Dashboard: métricas (leads, expedientes, activos, cerrados,
  perdidos, tasa de conversión, inversión en campañas, costo por lead, valor
  en pipeline), embudo de conversión por etapa y leads por fuente.

## 1.025 — Módulo de usuarios y roles — 29/05/26
- Panel de Usuarios (solo administradores): crear usuarios (correo, contraseña,
  nombre, rol), cambiar rol/estado y eliminar.
- Roles: Administrador (gestiona usuarios y todo) y Asesor (opera sin gestión
  de usuarios). El menú "Usuarios" solo aparece para administradores.
- Migración 0010 crea la tabla de perfiles. (El primer usuario sin perfil se
  trata como admin para el arranque.)

## 1.024 — Correos con logo y pie de contacto — 29/05/26
- Los correos llevan el logo y un pie con WhatsApp, sitio web, Facebook y
  TikTok (configurables en src/lib/marca.ts).

## 1.023 — Correo de mensajes sin el título interno — 29/05/26
- El correo de notificación de un mensaje ya no muestra el título interno;
  asunto neutral ("Tienes un mensaje de SAUCEDA Bienes Raíces") y solo el texto.

## 1.022 — Captación desde el sitio web (Cotizar) — 29/05/26
- Endpoint /api/captacion/web que recibe el formulario del sitio
  (saucedamx.com) y crea prospecto (origen sitio-web) + expediente en
  "nuevo-lead", con dedupe por teléfono/correo. CORS abierto para el sitio.

## 1.021 — Notificaciones por correo al cliente (Resend) — 29/05/26
- Al enviar un mensaje o un formulario, también se notifica al cliente por
  correo (a su email del prospecto), con la marca y el enlace a su portal.
- Best-effort: si no hay RESEND_API_KEY configurada, no envía (no rompe nada).
- Nuevas variables: RESEND_API_KEY, RESEND_FROM, SITE_URL.

## 1.020 — Panel excluye "Perdido" por defecto — 29/05/26
- El panel de operación oculta los expedientes en "Perdido" por defecto;
  para verlos, se selecciona el chip "Perdido".

## 1.019 — Avance del traspaso como stepper horizontal — 29/05/26
- El avance se muestra como pasos numerados conectados: verde (✓) las
  completadas, azul la actual, gris las siguientes. "Perdido" como estado aparte.

## 1.018 — Versión visible en el encabezado — 29/05/26
- Se muestra la versión (ej. v1.018) en el encabezado del panel, para saber
  qué versión se está usando.

## 1.017 — Detalle del expediente en 2 columnas — 29/05/26
- Izquierda: avance + mover de etapa, prospecto, portal del cliente
  (copiar/WhatsApp), formularios del cliente y mensajes al cliente.
- Derecha: información del expediente (teléfono, último movimiento, valor,
  saldo, atribución, situación, notas) + "Información recopilada" (respuestas
  de los formularios contestados, agrupadas aquí).
- Actividades a lo ancho debajo de ambas columnas.

## 1.016 — Portal del cliente siempre fresco (anti-caché) — 29/05/26
- El service worker ya no cachea navegaciones ni /seguimiento ni /api: el
  portal del cliente siempre lee datos frescos (refleja cambios de etapa).
- (El estado "Perdido" requiere además la migración 0003 aplicada en la BD.)

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
