-- Migration 0085: Teléfonos separados para llamadas y WhatsApp en perfiles de usuarios
-- =========================================================================

-- 1. Agregar la columna telefono_whatsapp a public.perfiles si no existe
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS telefono_whatsapp TEXT NOT NULL DEFAULT '';

-- 2. Inicializar los perfiles existentes con su teléfono actual para mantener retrocompatibilidad total
UPDATE public.perfiles
  SET telefono_whatsapp = telefono
  WHERE (telefono_whatsapp IS NULL OR telefono_whatsapp = '')
    AND telefono IS NOT NULL
    AND telefono <> '';
