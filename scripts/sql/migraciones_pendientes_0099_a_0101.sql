-- ============================================================
-- SCRIPT CONSOLIDADO: Migraciones pendientes 0099 a 0101
-- Pegar completo en Supabase -> SQL Editor -> Run
-- Idempotente: se puede correr más de una vez sin causar daño.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Eliminar comisiones duplicadas u originadas en recibos_pago
--    (de la migración 0099_comisiones_solo_remisiones_facturas)
-- ------------------------------------------------------------
DELETE FROM public.comisiones
WHERE remision_factura_id IS NULL;

-- ------------------------------------------------------------
-- 2. Columnas nuevas en comisiones
--    (de la migración 0099_comisiones_base_comisionable)
-- ------------------------------------------------------------
ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS costo_proveedor    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS comision_bancaria  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS base_comisionable  NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

UPDATE public.comisiones
SET base_comisionable = monto_venta
WHERE base_comisionable = 0.00;

-- ------------------------------------------------------------
-- 3. Columna nueva en remisiones_facturas
--    (de la migración 0100_remisiones_costos_proveedor_financiero)
-- ------------------------------------------------------------
ALTER TABLE public.remisiones_facturas
  ADD COLUMN IF NOT EXISTS costo_proveedor NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- ------------------------------------------------------------
-- 4. Función de sincronización de comisiones (versión final,
--    descuenta pasarela y proveedor de la base gravable)
--    (de la migración 0100_remisiones_costos_proveedor_financiero)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sincronizar_comisiones_todas()
RETURNS void AS $func$
DECLARE
  r RECORD;
  v_asesor_id UUID;
  v_porcentaje NUMERIC(5, 2) := 5.00;
  v_costo_fin NUMERIC(12, 2) := 0.00;
  v_costo_prov NUMERIC(12, 2) := 0.00;
  v_base_comisionable NUMERIC(12, 2) := 0.00;
  v_monto_com NUMERIC(12, 2) := 0.00;
BEGIN
  FOR r IN
    SELECT
      rf.id AS remision_id,
      rf.folio AS remision_folio,
      rf.fecha AS remision_fecha,
      rf.monto_total,
      rf.costo_financiero,
      rf.costo_proveedor,
      rf.orden_trabajo_id,
      rf.cotizacion_id,
      rf.expediente_id,
      ot.costo_proveedor AS ot_costo_proveedor,
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

    IF v_asesor_id IS NOT NULL AND r.monto_total > 0 THEN
      SELECT porcentaje INTO v_porcentaje
      FROM public.comisiones_reglas
      WHERE (tipo = 'asesor' AND asesor_id = v_asesor_id AND activo IS TRUE)
         OR (tipo = 'servicio' AND clave = LOWER(COALESCE(r.servicio_tipo, 'general')) AND activo IS TRUE)
         OR (tipo = 'general' AND activo IS TRUE)
      ORDER BY
        CASE tipo
          WHEN 'asesor' THEN 1
          WHEN 'servicio' THEN 2
          ELSE 3
        END ASC
      LIMIT 1;

      IF v_porcentaje IS NULL THEN
        v_porcentaje := 5.00;
      END IF;

      v_costo_fin := COALESCE(r.costo_financiero, 0.00);
      v_costo_prov := COALESCE(NULLIF(r.costo_proveedor, 0.00), r.ot_costo_proveedor, 0.00);
      v_base_comisionable := GREATEST(0.00, r.monto_total - v_costo_fin - v_costo_prov);

      v_monto_com := ROUND((v_base_comisionable * (v_porcentaje / 100.0)), 2);

      INSERT INTO public.comisiones (
        remision_factura_id,
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
        r.remision_id,
        NULL,
        v_asesor_id,
        r.cotizacion_id,
        r.expediente_id,
        r.orden_trabajo_id,
        r.remision_fecha,
        v_base_comisionable,
        v_porcentaje,
        v_monto_com,
        0.00,
        v_monto_com,
        'pendiente',
        false,
        jsonb_build_object(
          'origen', 'remision_factura',
          'folio', r.remision_folio,
          'montoTotalDocumento', r.monto_total,
          'costoFinanciero', v_costo_fin,
          'costoProveedor', v_costo_prov,
          'baseGravable', v_base_comisionable,
          'fechaCalculo', now()
        )
      );
    END IF;
  END LOOP;
END;
$func$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 5. Columnas nuevas en ordenes_trabajo (forma de cobro / MSI)
--    (de la migración 0101_ordenes_trabajo_metodo_pago)
-- ------------------------------------------------------------
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS metodo_pago_saldo    TEXT,
  ADD COLUMN IF NOT EXISTS meses_sin_intereses  INTEGER,
  ADD COLUMN IF NOT EXISTS comision_bancaria_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
