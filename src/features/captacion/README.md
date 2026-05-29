# Capa de captación / webhooks (FUTURO — no construido en Incremento 1)

Aquí entrará la **entrada de leads** desde fuentes externas:
webhooks de Meta/Facebook Lead Ads, formularios web, WhatsApp (Twilio), etc.
Su trabajo será normalizar un lead entrante y crear un `Expediente`
nuevo en etapa `nuevo-lead`.

> Fuera del alcance del Incremento 1. No hay integraciones externas todavía.

Ideas de organización cuando llegue el momento:

- `webhooks/` — handlers por fuente (meta, twilio, web).
- `normalizadores/` — transforman el payload externo a `Expediente`.
- Las rutas API vivirían en `src/app/api/captacion/...`.
