# Capa de captación / webhooks

Entrada de leads desde fuentes externas. Normaliza el lead entrante y crea
un `Expediente` nuevo en etapa `nuevo-lead`.

## Hecho: WhatsApp (Meta Cloud API)

- `whatsapp.ts` — parsea el webhook de Meta y registra el lead (dedupe por
  teléfono). No requiere sesión de admin: usa el cliente con service role.
- Endpoint: `src/app/api/captacion/whatsapp/route.ts`
  - `GET` — verificación del webhook (handshake con `WHATSAPP_VERIFY_TOKEN`).
  - `POST` — recibe mensajes, valida la firma (`WHATSAPP_APP_SECRET`) y
    crea/actualiza expedientes.

### Configuración en Meta
1. App de Meta → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://TU-SITIO/api/captacion/whatsapp`
   - Verify token: el valor de `WHATSAPP_VERIFY_TOKEN`
   - Suscríbete al campo **messages**.
2. Variables de entorno (Netlify): `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`.

## Futuro
- Más fuentes: Meta Lead Ads, formularios web.
- Responder automáticamente al cliente por WhatsApp (requiere token de envío).
