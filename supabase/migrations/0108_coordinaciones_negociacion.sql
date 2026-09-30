-- ============================================================
-- Migración 0108: coordinaciones_inspeccion.negociacion
-- ============================================================
-- Estado de la negociación por etapas entre los asesores cuando ninguna de las
-- opciones propuestas les acomoda: primero se acuerda el DÍA, luego la FRANJA
-- (mañana / tarde) y por último la HORA exacta entre horarios libres.
-- Estructura: { etapa, ronda, diasOfrecidos[], dias{asesor:{fechas[],listo}},
--               paresOfrecidos[], franjas{asesor:{claves[],listo}}, motivo }

ALTER TABLE public.coordinaciones_inspeccion
  ADD COLUMN IF NOT EXISTS negociacion JSONB NOT NULL DEFAULT '{}'::jsonb;
