# Servicios externos (FUTURO — no construido en Incremento 1)

Capa de integración con servicios de terceros. Cada servicio se aísla
detrás de su propia interfaz para poder cambiar de proveedor sin tocar
el resto de la app.

> Fuera del alcance del Incremento 1. No hay integraciones externas todavía.

Servicios previstos:

- `drive/` — almacenamiento de documentos (Google Drive u otro).
- `ocr/` — extracción de datos de documentos escaneados.
- `firma/` — firma electrónica de contratos.
- `mensajeria/` — WhatsApp / SMS (Twilio).

Patrón sugerido: cada carpeta expone una interfaz (`*.types.ts`) y una
implementación intercambiable, consumida vía inyección simple desde la
capa de aplicación.
