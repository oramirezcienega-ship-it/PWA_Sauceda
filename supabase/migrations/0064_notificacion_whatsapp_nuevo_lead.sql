-- Migration 0064: Agregar notificar_whatsapp_nuevo_lead a public.perfiles

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS notificar_whatsapp_nuevo_lead BOOLEAN DEFAULT FALSE;

-- Activar la notificación por defecto para usuarios administradores u Oscar
UPDATE public.perfiles
  SET notificar_whatsapp_nuevo_lead = TRUE
  WHERE rol = 'admin' OR nombre ILIKE '%oscar%';
