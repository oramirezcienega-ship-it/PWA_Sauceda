-- ==============================================================================
-- MIGRACIÓN CONSOLIDADA: MÓDULO DE COMISIONES DE ASESORES (PRODUCCIÓN & STAGING)
-- Incluye: Migraciones 0096, 0097 y 0098
-- Ejecutar en: Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Tabla de Parámetros y Reglas de Comisiones
CREATE TABLE IF NOT EXISTS public.comisiones_reglas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         TEXT NOT NULL CHECK (tipo IN ('global', 'servicio', 'producto', 'asesor')),
  clave        TEXT NOT NULL,
  etiqueta     TEXT NOT NULL,
  porcentaje   NUMERIC(5, 2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  asesor_id    UUID REFERENCES public.perfiles(id) ON DELETE CASCADE,
  activo       BOOLEAN NOT NULL DEFAULT true,
  notas        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_reglas_tipo_clave ON public.comisiones_reglas(tipo, clave);
CREATE INDEX IF NOT EXISTS idx_comisiones_reglas_asesor ON public.comisiones_reglas(asesor_id);

-- 2. Tabla Principal de Comisiones (vinculada a Remisiones, Facturas y Recibos)
CREATE TABLE IF NOT EXISTS public.comisiones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remision_factura_id UUID REFERENCES public.remisiones_facturas(id) ON DELETE CASCADE,
  recibo_pago_id      UUID REFERENCES public.recibos_pago(id) ON DELETE SET NULL,
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
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asegurar columna recibo_pago_id si la tabla ya existía
ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS recibo_pago_id UUID REFERENCES public.recibos_pago(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comisiones_asesor ON public.comisiones(asesor_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_remision ON public.comisiones(remision_factura_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_recibo ON public.comisiones(recibo_pago_id);
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

-- 5. Agregar porcentaje_comision a productos_servicios
ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS porcentaje_comision NUMERIC(5, 2) DEFAULT NULL;

-- 6. Trigger para recalcular automáticamente saldo y estatus tras pagos
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

-- 7. Trigger para recalcular saldo_pendiente cuando se actualiza el monto_comision
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

-- 8. Seed inicial de reglas de comisiones
INSERT INTO public.comisiones_reglas (tipo, clave, etiqueta, porcentaje, activo, notas)
VALUES
  ('global', 'general', 'Regla Base General', 5.00, true, 'Porcentaje por defecto para todas las ventas si no hay regla específica'),
  ('servicio', 'impermeabilizacion', 'Impermeabilización', 5.00, true, 'Comisión estándar en proyectos de impermeabilización'),
  ('servicio', 'mantenimiento_cisternas', 'Mantenimiento de Cisternas', 6.00, true, 'Comisión en lavado y mantenimiento de aljibes/cisternas'),
  ('servicio', 'herreria', 'Herrería y Estructuras', 5.00, true, 'Comisión en proyectos de cancelería y herrería'),
  ('servicio', 'piso_estampado', 'Piso Estampado', 5.00, true, 'Comisión en concreto y pisos decorativos'),
  ('servicio', 'pintura', 'Pintura y Acabados', 5.00, true, 'Comisión en trabajos de pintura y recubrimientos'),
  ('servicio', 'remodelacion', 'Remodelación Integral', 4.50, true, 'Comisión en remodelaciones generales')
ON CONFLICT DO NOTHING;

-- 9. Políticas de Seguridad RLS
ALTER TABLE public.comisiones_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_pagos_detalle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total comisiones_reglas authenticated" ON public.comisiones_reglas;
DROP POLICY IF EXISTS "Permitir todo comisiones_reglas" ON public.comisiones_reglas;
CREATE POLICY "Permitir todo comisiones_reglas" ON public.comisiones_reglas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total comisiones authenticated" ON public.comisiones;
DROP POLICY IF EXISTS "Permitir todo comisiones" ON public.comisiones;
CREATE POLICY "Permitir todo comisiones" ON public.comisiones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total comisiones_pagos authenticated" ON public.comisiones_pagos;
DROP POLICY IF EXISTS "Permitir todo comisiones_pagos" ON public.comisiones_pagos;
CREATE POLICY "Permitir todo comisiones_pagos" ON public.comisiones_pagos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total comisiones_pagos_detalle authenticated" ON public.comisiones_pagos_detalle;
DROP POLICY IF EXISTS "Permitir todo comisiones_pagos_detalle" ON public.comisiones_pagos_detalle;
CREATE POLICY "Permitir todo comisiones_pagos_detalle" ON public.comisiones_pagos_detalle FOR ALL USING (true) WITH CHECK (true);

-- 10. Función para sincronizar comisiones tanto de remisiones como de recibos de pago
CREATE OR REPLACE FUNCTION public.fn_sincronizar_comisiones_todas()
RETURNS void AS $$
DECLARE
  r RECORD;
  v_asesor_id UUID;
  v_porcentaje NUMERIC(5, 2) := 5.00;
  v_monto_com NUMERIC(12, 2);
BEGIN
  -- 10.1 Sincronizar desde recibos_pago
  FOR r IN
    SELECT
      rp.id AS recibo_id,
      rp.folio AS recibo_folio,
      rp.monto,
      rp.fecha_pago,
      rp.orden_trabajo_id,
      rp.cotizacion_id,
      rp.expediente_id,
      ot.asesor_ejecutor_id,
      ot.asesor_responsable_id,
      cot.servicio_tipo,
      p.asesor_id AS prospecto_asesor_id
    FROM public.recibos_pago rp
    LEFT JOIN public.ordenes_trabajo ot ON ot.id = rp.orden_trabajo_id
    LEFT JOIN public.cotizaciones cot ON cot.id = rp.cotizacion_id
    LEFT JOIN public.prospectos p ON p.id = cot.prospecto_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.comisiones c
      WHERE c.recibo_pago_id = rp.id
    )
  LOOP
    v_asesor_id := COALESCE(
      r.asesor_ejecutor_id,
      r.asesor_responsable_id,
      r.prospecto_asesor_id
    );

    IF v_asesor_id IS NULL THEN
      SELECT id INTO v_asesor_id
      FROM public.perfiles
      WHERE rol = 'asesor' AND activo IS TRUE
      ORDER BY nombre ASC
      LIMIT 1;
    END IF;

    IF v_asesor_id IS NULL THEN
      SELECT id INTO v_asesor_id
      FROM public.perfiles
      WHERE activo IS TRUE
      ORDER BY nombre ASC
      LIMIT 1;
    END IF;

    IF v_asesor_id IS NOT NULL AND r.monto > 0 THEN
      IF r.servicio_tipo IS NOT NULL THEN
        SELECT porcentaje INTO v_porcentaje
        FROM public.comisiones_reglas
        WHERE tipo = 'servicio' AND clave = lower(r.servicio_tipo) AND activo IS TRUE
        LIMIT 1;
        IF v_porcentaje IS NULL THEN v_porcentaje := 5.00; END IF;
      ELSE
        v_porcentaje := 5.00;
      END IF;

      v_monto_com := ROUND(r.monto * (v_porcentaje / 100.0), 2);

      INSERT INTO public.comisiones (
        recibo_pago_id,
        asesor_id,
        cotizacion_id,
        expediente_id,
        orden_trabajo_id,
        fecha,
        monto_venta,
        porcentaje_comision,
        monto_comision,
        monto_pagado,
        saldo_pendiente,
        estatus,
        es_ajuste_manual,
        detalles_calculo
      ) VALUES (
        r.recibo_id,
        v_asesor_id,
        r.cotizacion_id,
        r.expediente_id,
        r.orden_trabajo_id,
        COALESCE(r.fecha_pago, CURRENT_DATE),
        r.monto,
        v_porcentaje,
        v_monto_com,
        0.00,
        v_monto_com,
        'pendiente',
        false,
        jsonb_build_object('origen', 'recibo_pago', 'folio', r.recibo_folio)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- 10.2 Sincronizar desde remisiones_facturas
  FOR r IN
    SELECT
      rf.id AS remision_id,
      rf.folio AS remision_folio,
      rf.tipo AS remision_tipo,
      COALESCE(rf.monto_total, rf.monto_subtotal, 0) AS monto,
      rf.fecha,
      rf.orden_trabajo_id,
      rf.cotizacion_id,
      rf.expediente_id,
      ot.asesor_ejecutor_id,
      ot.asesor_responsable_id,
      cot.servicio_tipo,
      p.asesor_id AS prospecto_asesor_id
    FROM public.remisiones_facturas rf
    LEFT JOIN public.ordenes_trabajo ot ON ot.id = rf.orden_trabajo_id
    LEFT JOIN public.cotizaciones cot ON cot.id = rf.cotizacion_id
    LEFT JOIN public.prospectos p ON p.id = cot.prospecto_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.comisiones c
      WHERE c.remision_factura_id = rf.id
    )
  LOOP
    v_asesor_id := COALESCE(
      r.asesor_ejecutor_id,
      r.asesor_responsable_id,
      r.prospecto_asesor_id
    );

    IF v_asesor_id IS NULL THEN
      SELECT id INTO v_asesor_id
      FROM public.perfiles
      WHERE rol = 'asesor' AND activo IS TRUE
      ORDER BY nombre ASC
      LIMIT 1;
    END IF;

    IF v_asesor_id IS NULL THEN
      SELECT id INTO v_asesor_id
      FROM public.perfiles
      WHERE activo IS TRUE
      ORDER BY nombre ASC
      LIMIT 1;
    END IF;

    IF v_asesor_id IS NOT NULL AND r.monto > 0 THEN
      IF r.servicio_tipo IS NOT NULL THEN
        SELECT porcentaje INTO v_porcentaje
        FROM public.comisiones_reglas
        WHERE tipo = 'servicio' AND clave = lower(r.servicio_tipo) AND activo IS TRUE
        LIMIT 1;
        IF v_porcentaje IS NULL THEN v_porcentaje := 5.00; END IF;
      ELSE
        v_porcentaje := 5.00;
      END IF;

      v_monto_com := ROUND(r.monto * (v_porcentaje / 100.0), 2);

      INSERT INTO public.comisiones (
        remision_factura_id,
        asesor_id,
        cotizacion_id,
        expediente_id,
        orden_trabajo_id,
        fecha,
        monto_venta,
        porcentaje_comision,
        monto_comision,
        monto_pagado,
        saldo_pendiente,
        estatus,
        es_ajuste_manual,
        detalles_calculo
      ) VALUES (
        r.remision_id,
        v_asesor_id,
        r.cotizacion_id,
        r.expediente_id,
        r.orden_trabajo_id,
        COALESCE(r.fecha, CURRENT_DATE),
        r.monto,
        v_porcentaje,
        v_monto_com,
        0.00,
        v_monto_com,
        'pendiente',
        false,
        jsonb_build_object('origen', 'remision_factura', 'folio', r.remision_folio)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 11. Ejecutar la sincronización inmediata de todas las ventas históricas
SELECT public.fn_sincronizar_comisiones_todas();

-- 12. Notificar recarga de PostgREST
NOTIFY pgrst, 'reload schema';
