-- Migration 0162: Canal preferido del proveedor (WhatsApp o Telegram)
-- ============================================================
-- Muchos proveedores no instalan Telegram. Cada proveedor elige por dónde recibe las
-- cotizaciones especiales y las solicitudes de fecha:
--   whatsapp → mensaje con resumen + link a su portal, donde responde con un formulario
--   telegram → mensaje con botones (precio → tiempo → qué incluye)
-- Por defecto WhatsApp.

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS canal_preferido TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (canal_preferido IN ('whatsapp', 'telegram'));

-- Los que ya tienen Telegram ligado se quedan en Telegram
UPDATE public.proveedores SET canal_preferido = 'telegram' WHERE telegram_chat_id IS NOT NULL;

-- Por cuál canal se le avisó de cada cotización especial
ALTER TABLE public.cotizaciones_especiales_respuestas
  ADD COLUMN IF NOT EXISTS canal TEXT;
