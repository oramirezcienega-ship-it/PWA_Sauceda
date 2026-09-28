-- ============================================================
-- Migración 0098: Vincular Recibos Oficiales de Pago con Comisiones
-- ============================================================

-- 1. Agregar recibo_pago_id a comisiones
ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS recibo_pago_id UUID REFERENCES public.recibos_pago(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comisiones_recibo ON public.comisiones(recibo_pago_id);

-- 2. Función para sincronizar comisiones tanto de remisiones como de recibos de pago
CREATE OR REPLACE FUNCTION public.fn_sincronizar_comisiones_todas()
RETURNS void AS $$
DECLARE
  r RECORD;
  v_asesor_id UUID;
  v_porcentaje NUMERIC(5, 2) := 5.00;
  v_monto_com NUMERIC(12, 2);
BEGIN
  -- 2.1 Sincronizar desde recibos_pago que no tengan comisión previa
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
         OR (rp.orden_trabajo_id IS NOT NULL AND c.orden_trabajo_id = rp.orden_trabajo_id)
         OR (rp.cotizacion_id IS NOT NULL AND c.cotizacion_id = rp.cotizacion_id)
    )
  LOOP
    -- Determinar asesor
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

    IF v_asesor_id IS NOT NULL AND r.monto > 0 THEN
      -- Buscar porcentaje por servicio si existe
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
END;
$$ LANGUAGE plpgsql;

-- Ejecutar la sincronización inicial
SELECT public.fn_sincronizar_comisiones_todas();
