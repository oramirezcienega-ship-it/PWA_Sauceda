-- ============================================================
-- Migración 0105: perfiles.telefono_whatsapp
-- ============================================================
-- El código (coordinación de inspecciones, agenda, alta de usuarios) lee y
-- escribe perfiles.telefono_whatsapp, pero la columna no existía en esta base:
-- la consulta fallaba y la propuesta de inspección no se enviaba a nadie.
-- Se agrega y se rellena con el teléfono actual de cada usuario.

ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS telefono_whatsapp TEXT;

UPDATE public.perfiles
SET telefono_whatsapp = telefono
WHERE (telefono_whatsapp IS NULL OR telefono_whatsapp = '')
  AND telefono IS NOT NULL AND telefono <> '';
