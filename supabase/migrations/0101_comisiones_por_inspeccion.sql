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

-- 6. Función y Trigger automático para comisiones de inspección ejecutada
CREATE OR REPLACE FUNCTION public.fn_trg_comision_inspeccion()
RETURNS TRIGGER AS $$
DECLARE
  v_monto NUMERIC(12, 2);
  v_asesor UUID;
BEGIN
  -- Verificar si es una inspección completada
  IF NEW.tipo_cita = 'inspeccion' AND (
    NEW.estado = 'completada' OR 
    NEW.notas ILIKE '%Finalizada%' OR 
    NEW.notas ILIKE '%Retro%'
  ) THEN
    -- Determinar asesor responsable
    v_asesor := NEW.perfil_id;
    IF v_asesor IS NULL AND NEW.expediente_id IS NOT NULL THEN
      SELECT asesor_id INTO v_asesor FROM public.expedientes WHERE id = NEW.expediente_id;
    END IF;
    IF v_asesor IS NULL AND NEW.prospecto_id IS NOT NULL THEN
      SELECT asesor_id INTO v_asesor FROM public.prospectos WHERE id = NEW.prospecto_id;
    END IF;
    IF v_asesor IS NULL THEN
      SELECT id INTO v_asesor FROM public.perfiles WHERE rol = 'asesor' AND activo = true ORDER BY nombre ASC LIMIT 1;
    END IF;

    -- Si tenemos asesor, calcular monto de regla
    IF v_asesor IS NOT NULL THEN
      -- Primero regla individual del asesor si existe
      SELECT monto_fijo INTO v_monto FROM public.comisiones_reglas 
      WHERE tipo = 'inspeccion' AND asesor_id = v_asesor AND activo = true LIMIT 1;
      
      -- Si no hay individual, regla general de inspección
      IF v_monto IS NULL OR v_monto <= 0 THEN
        SELECT COALESCE(monto_fijo, 150.00) INTO v_monto FROM public.comisiones_reglas 
        WHERE tipo = 'inspeccion' AND clave = 'general' AND activo = true LIMIT 1;
      END IF;

      IF v_monto IS NULL OR v_monto <= 0 THEN
        v_monto := 150.00;
      END IF;

      -- Insertar o actualizar comisión
      INSERT INTO public.comisiones (
        cita_id,
        tipo_comision,
        asesor_id,
        expediente_id,
        fecha,
        monto_venta,
        costo_proveedor,
        comision_bancaria,
        base_comisionable,
        porcentaje_comision,
        monto_comision,
        monto_pagado,
        saldo_pendiente,
        estatus,
        notas,
        detalles_calculo,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        'inspeccion',
        v_asesor,
        NEW.expediente_id,
        COALESCE(NEW.fecha, CURRENT_DATE),
        0.00,
        0.00,
        0.00,
        v_monto,
        100.00,
        v_monto,
        0.00,
        v_monto,
        'pendiente',
        COALESCE(NEW.notas, 'Comisión fija por inspección técnica ejecutada'),
        jsonb_build_object('origen', 'trigger_agenda_citas', 'citaId', NEW.id, 'fecha', CURRENT_TIMESTAMP),
        NOW(),
        NOW()
      )
      ON CONFLICT (cita_id, asesor_id) WHERE cita_id IS NOT NULL
      DO UPDATE SET
        expediente_id = EXCLUDED.expediente_id,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comision_inspeccion ON public.agenda_citas;
CREATE TRIGGER trg_comision_inspeccion
  AFTER INSERT OR UPDATE OF estado, notas
  ON public.agenda_citas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_comision_inspeccion();


