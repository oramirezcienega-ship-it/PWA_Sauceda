-- ============================================================
-- Migración 0096: Módulo de Comisiones para Asesores
-- ============================================================

-- 1. Tabla de Parámetros y Reglas de Comisiones
CREATE TABLE IF NOT EXISTS public.comisiones_reglas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         TEXT NOT NULL CHECK (tipo IN ('global', 'servicio', 'producto', 'asesor')),
  clave        TEXT NOT NULL, -- 'general', 'impermeabilizacion', 'losa', etc.
  etiqueta     TEXT NOT NULL, -- Nombre descriptivo
  porcentaje   NUMERIC(5, 2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  asesor_id    UUID REFERENCES public.perfiles(id) ON DELETE CASCADE,
  activo       BOOLEAN NOT NULL DEFAULT true,
  notas        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_reglas_tipo_clave ON public.comisiones_reglas(tipo, clave);
CREATE INDEX IF NOT EXISTS idx_comisiones_reglas_asesor ON public.comisiones_reglas(asesor_id);

-- 2. Tabla Principal de Comisiones (vinculada a Remisiones / Facturas)
CREATE TABLE IF NOT EXISTS public.comisiones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remision_factura_id UUID REFERENCES public.remisiones_facturas(id) ON DELETE CASCADE,
  asesor_id           UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  cotizacion_id       TEXT REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  expediente_id       TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL,
  orden_trabajo_id    UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  monto_venta         NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  porcentaje_comision NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
  monto_comision      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  monto_pagado        NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  saldo_pendiente     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estatus             TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'parcial', 'pagada', 'cancelada')),
  es_ajuste_manual    BOOLEAN NOT NULL DEFAULT false,
  motivo_ajuste       TEXT NOT NULL DEFAULT '',
  detalles_calculo    JSONB NOT NULL DEFAULT '{}'::jsonb,
  notas               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_comisiones_remision_asesor UNIQUE (remision_factura_id, asesor_id)
);

CREATE INDEX IF NOT EXISTS idx_comisiones_asesor ON public.comisiones(asesor_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_remision ON public.comisiones(remision_factura_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_fecha ON public.comisiones(fecha);
CREATE INDEX IF NOT EXISTS idx_comisiones_estatus ON public.comisiones(estatus);

-- 3. Tabla de Pagos / Liquidaciones de Comisiones
CREATE TABLE IF NOT EXISTS public.comisiones_pagos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id       UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
  monto           NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  metodo_pago     TEXT NOT NULL DEFAULT 'transferencia' CHECK (metodo_pago IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro')),
  referencia      TEXT NOT NULL DEFAULT '',
  comprobante_url TEXT NOT NULL DEFAULT '',
  notas           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_asesor ON public.comisiones_pagos(asesor_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_fecha ON public.comisiones_pagos(fecha_pago);

-- 4. Detalle de Aplicación de Pagos a Comisiones Específicas
CREATE TABLE IF NOT EXISTS public.comisiones_pagos_detalle (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id        UUID NOT NULL REFERENCES public.comisiones_pagos(id) ON DELETE CASCADE,
  comision_id    UUID NOT NULL REFERENCES public.comisiones(id) ON DELETE CASCADE,
  monto_aplicado NUMERIC(12, 2) NOT NULL CHECK (monto_aplicado > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pago_comision UNIQUE (pago_id, comision_id)
);

CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_det_pago ON public.comisiones_pagos_detalle(pago_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_det_com ON public.comisiones_pagos_detalle(comision_id);

-- 5. Trigger para recalcular automáticamente saldo y estatus tras pagos
CREATE OR REPLACE FUNCTION public.fn_sincronizar_saldo_comision()
RETURNS TRIGGER AS $$
DECLARE
  v_comision_id UUID;
  v_total_pagado NUMERIC(12, 2);
  v_monto_comision NUMERIC(12, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_comision_id := OLD.comision_id;
  ELSE
    v_comision_id := NEW.comision_id;
  END IF;

  -- Calcular total pagado actual
  SELECT COALESCE(SUM(monto_aplicado), 0.00)
  INTO v_total_pagado
  FROM public.comisiones_pagos_detalle
  WHERE comision_id = v_comision_id;

  SELECT monto_comision
  INTO v_monto_comision
  FROM public.comisiones
  WHERE id = v_comision_id;

  IF v_monto_comision IS NOT NULL THEN
    UPDATE public.comisiones
    SET
      monto_pagado = v_total_pagado,
      saldo_pendiente = GREATEST(0.00, v_monto_comision - v_total_pagado),
      estatus = CASE
        WHEN v_total_pagado >= v_monto_comision THEN 'pagada'
        WHEN v_total_pagado > 0 THEN 'parcial'
        ELSE 'pendiente'
      END,
      updated_at = now()
    WHERE id = v_comision_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comisiones_pagos_detalle_sync ON public.comisiones_pagos_detalle;
CREATE TRIGGER trg_comisiones_pagos_detalle_sync
AFTER INSERT OR UPDATE OR DELETE ON public.comisiones_pagos_detalle
FOR EACH ROW
EXECUTE FUNCTION public.fn_sincronizar_saldo_comision();

-- 6. Trigger para recalcular saldo_pendiente cuando se actualiza el monto_comision
CREATE OR REPLACE FUNCTION public.fn_recalcular_saldo_comision_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.saldo_pendiente := GREATEST(0.00, NEW.monto_comision - NEW.monto_pagado);
  IF NEW.estatus != 'cancelada' THEN
    IF NEW.monto_pagado >= NEW.monto_comision THEN
      NEW.estatus := 'pagada';
    ELSIF NEW.monto_pagado > 0 THEN
      NEW.estatus := 'parcial';
    ELSE
      NEW.estatus := 'pendiente';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comisiones_recalcular_saldo ON public.comisiones;
CREATE TRIGGER trg_comisiones_recalcular_saldo
BEFORE UPDATE OF monto_comision, monto_pagado ON public.comisiones
FOR EACH ROW
EXECUTE FUNCTION public.fn_recalcular_saldo_comision_update();

-- 7. Habilitar RLS
ALTER TABLE public.comisiones_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_pagos_detalle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados comisiones_reglas" ON public.comisiones_reglas;
CREATE POLICY "Permitir todo a usuarios autenticados comisiones_reglas" ON public.comisiones_reglas FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica comisiones_reglas" ON public.comisiones_reglas;
CREATE POLICY "Permitir lectura publica comisiones_reglas" ON public.comisiones_reglas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados comisiones" ON public.comisiones;
CREATE POLICY "Permitir todo a usuarios autenticados comisiones" ON public.comisiones FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica comisiones" ON public.comisiones;
CREATE POLICY "Permitir lectura publica comisiones" ON public.comisiones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados comisiones_pagos" ON public.comisiones_pagos;
CREATE POLICY "Permitir todo a usuarios autenticados comisiones_pagos" ON public.comisiones_pagos FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica comisiones_pagos" ON public.comisiones_pagos;
CREATE POLICY "Permitir lectura publica comisiones_pagos" ON public.comisiones_pagos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados comisiones_pagos_detalle" ON public.comisiones_pagos_detalle;
CREATE POLICY "Permitir todo a usuarios autenticados comisiones_pagos_detalle" ON public.comisiones_pagos_detalle FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica comisiones_pagos_detalle" ON public.comisiones_pagos_detalle;
CREATE POLICY "Permitir lectura publica comisiones_pagos_detalle" ON public.comisiones_pagos_detalle FOR SELECT USING (true);

-- 8. Poblar reglas por defecto iniciales
INSERT INTO public.comisiones_reglas (tipo, clave, etiqueta, porcentaje, notas)
VALUES
  ('global', 'general', 'Comisión Base General', 5.00, 'Porcentaje base aplicado por defecto a ventas sin regla específica'),
  ('servicio', 'impermeabilizacion', 'Impermeabilización', 5.00, 'Servicios de impermeabilización tradicional y acrílica'),
  ('servicio', 'losa', 'Losa y Concreto', 4.00, 'Colados, firmes y reparaciones estructurales de losa'),
  ('servicio', 'pintura', 'Pintura y Recubrimientos', 5.00, 'Pintura vinílica, esmaltes y acabados decorativos'),
  ('servicio', 'remodelacion', 'Remodelación Integral', 5.00, 'Obras de remodelación habitacional y comercial'),
  ('servicio', 'mantenimiento_cisternas', 'Mantenimiento de Cisternas', 5.00, 'Lavado, desinfección y sellado de cisternas'),
  ('servicio', 'herreria', 'Herrería y Estructuras', 5.00, 'Puertas, barandales, cancelería y herrería'),
  ('servicio', 'piso_estampado', 'Piso Estampado', 5.00, 'Concreto estampado y texturizado'),
  ('servicio', 'construccion', 'Construcción General', 5.00, 'Edificación y obra civil general')
ON CONFLICT DO NOTHING;
