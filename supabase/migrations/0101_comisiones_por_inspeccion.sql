-- ============================================================
-- Migración 0101: Comisiones por Inspección Técnica Ejecutada
-- ============================================================

-- 1. Ampliar comisiones_reglas para permitir tipo 'inspeccion' y columna monto_fijo
ALTER TABLE public.comisiones_reglas
  ADD COLUMN IF NOT EXISTS monto_fijo NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.comisiones_reglas 
  DROP CONSTRAINT IF EXISTS comisiones_reglas_tipo_check;

ALTER TABLE public.comisiones_reglas 
  ADD CONSTRAINT comisiones_reglas_tipo_check 
  CHECK (tipo IN ('global', 'servicio', 'producto', 'asesor', 'inspeccion'));

-- 2. Regla base por defecto para comisiones de inspección
INSERT INTO public.comisiones_reglas (tipo, clave, etiqueta, monto_fijo, porcentaje, activo, notas)
SELECT 'inspeccion', 'general', 'Comisión Fija por Inspección Técnica', 150.00, 0.00, true, 'Tarifa fija asignada al asesor técnico por cada inspección técnica ejecutada en sitio de un expediente'
WHERE NOT EXISTS (
  SELECT 1 FROM public.comisiones_reglas WHERE tipo = 'inspeccion' AND clave = 'general'
);

-- 3. Ampliar tabla comisiones para asociar citas de inspección y tipo de comisión
ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS tipo_comision TEXT NOT NULL DEFAULT 'venta',
  ADD COLUMN IF NOT EXISTS cita_id UUID REFERENCES public.agenda_citas(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comisiones_tipo_comision_check'
  ) THEN
    ALTER TABLE public.comisiones 
      ADD CONSTRAINT comisiones_tipo_comision_check 
      CHECK (tipo_comision IN ('venta', 'inspeccion', 'bono', 'otro'));
  END IF;
END $$;

-- 4. Índices para agilizar consultas y evitar duplicados de comisión por la misma inspección
CREATE INDEX IF NOT EXISTS idx_comisiones_cita_id ON public.comisiones(cita_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_tipo_comision ON public.comisiones(tipo_comision);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comisiones_cita_asesor ON public.comisiones (cita_id, asesor_id) WHERE cita_id IS NOT NULL;

-- 5. Permitir estado 'completada' y 'reagendada' en agenda_citas
ALTER TABLE public.agenda_citas 
  DROP CONSTRAINT IF EXISTS agenda_citas_estado_check;

ALTER TABLE public.agenda_citas 
  ADD CONSTRAINT agenda_citas_estado_check 
  CHECK (estado IN ('pendiente', 'confirmada', 'completada', 'cancelada', 'reagendada'));

