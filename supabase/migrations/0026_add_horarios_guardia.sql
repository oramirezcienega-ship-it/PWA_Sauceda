-- Migration 0026: Agregar horarios_guardia JSONB a perfiles
-- ============================================================

-- 1. Agregar columna horarios_guardia con un valor por defecto estructurado
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS horarios_guardia JSONB NOT NULL DEFAULT '{
    "lunes": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "martes": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "miercoles": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "jueves": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "viernes": [{"inicio": "09:00:00", "fin": "18:00:00"}],
    "sabado": [],
    "domingo": []
  }'::jsonb;
