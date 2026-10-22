-- Cliente en el que está enfocada la sesión de retro por WhatsApp (teléfono normalizado),
-- cuando el asesor entra desde el link "Dar retro" de un cliente en particular.
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS retro_whatsapp_cliente TEXT;
