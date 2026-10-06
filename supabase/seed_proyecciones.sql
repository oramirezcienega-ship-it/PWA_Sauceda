-- ============================================================
-- SEED PROYECCIONES: Escenario "Base Q4 2026"
-- CRM SAUCEDA (Business Case Q4 2026)
-- ============================================================

DO $$
DECLARE
  v_bu_br uuid;
  v_bu_co uuid;
  v_esc_id uuid;
  v_l_comp uuid;
  v_l_excl uuid;
  v_l_tram uuid;
  v_l_remo uuid;
BEGIN
  -- 1. Obtener IDs de Unidades de Negocio
  SELECT id INTO v_bu_br FROM public.business_units WHERE nombre ILIKE '%Bienes Raíces%' LIMIT 1;
  SELECT id INTO v_bu_co FROM public.business_units WHERE nombre ILIKE '%Construye%' LIMIT 1;

  -- 2. Crear o resetear el escenario Base Q4 2026
  DELETE FROM public.fin_escenarios WHERE nombre = 'Base Q4 2026';

  INSERT INTO public.fin_escenarios (
    nombre,
    periodo_inicio,
    periodo_fin,
    fecha_corte_real,
    es_activo,
    notas
  ) VALUES (
    'Base Q4 2026',
    '2026-10-01',
    '2026-12-01',
    '2026-09-30',
    true,
    'Business case Q4 2026 oficial de Bienes Raíces y Construcción. Meta: $120,000 ingreso, $71,900 margen, $62,900 utilidad operativa.'
  ) RETURNING id INTO v_esc_id;

  -- 3. Crear Líneas de Negocio en Bienes Raíces
  -- 3.1 Casa compartida + trámite
  INSERT INTO public.fin_lineas_plan (
    escenario_id, business_unit_id, nombre, tipo_negocio, origen, modelo, esquema_cobro, orden
  ) VALUES (
    v_esc_id, v_bu_br, 'Casa compartida + trámite', 'traspaso_compra', 'nuevo', 'manual',
    '[{"pct": 0.5, "desfase_meses": 0}, {"pct": 0.5, "desfase_meses": 1}]'::jsonb, 1
  ) RETURNING id INTO v_l_comp;

  -- 3.2 Casa propia en exclusiva + trámite
  INSERT INTO public.fin_lineas_plan (
    escenario_id, business_unit_id, nombre, tipo_negocio, origen, modelo, esquema_cobro, orden
  ) VALUES (
    v_esc_id, v_bu_br, 'Casa propia en exclusiva + trámite', 'promocion_venta', 'nuevo', 'manual',
    '[{"pct": 1, "desfase_meses": 0}]'::jsonb, 2
  ) RETURNING id INTO v_l_excl;

  -- 3.3 Solo trámite INFONAVIT
  INSERT INTO public.fin_lineas_plan (
    escenario_id, business_unit_id, nombre, tipo_negocio, origen, modelo, esquema_cobro, orden
  ) VALUES (
    v_esc_id, v_bu_br, 'Solo trámite INFONAVIT', 'solo_tramite', 'nuevo', 'manual',
    '[{"pct": 0.5, "desfase_meses": 0}, {"pct": 0.5, "desfase_meses": 1}]'::jsonb, 3
  ) RETURNING id INTO v_l_tram;

  -- 3.4 Remodelación (venta cruzada, unidad Construye)
  INSERT INTO public.fin_lineas_plan (
    escenario_id, business_unit_id, nombre, tipo_negocio, origen, modelo, esquema_cobro, orden
  ) VALUES (
    v_esc_id, v_bu_br, 'Remodelación (venta cruzada, unidad Construye)', 'construccion-remodelacion', 'nuevo', 'manual',
    '[{"pct": 1, "desfase_meses": 0}]'::jsonb, 4
  ) RETURNING id INTO v_l_remo;

  -- 4. Supuestos mensuales para las 4 líneas (oct-2026, nov-2026, dic-2026)
  -- 4.1 Casa compartida: ticket $26,000, costo directo $6,500 (25%), comisión asesor $4,400 (16.923%), ops: 0.6 / 0.9 / 1.5
  INSERT INTO public.fin_supuestos_mes (linea_id, mes, operaciones_manual, ticket_promedio, margen_pct, pct_comision_asesor, fuente)
  VALUES
    (v_l_comp, '2026-10-01', 0.6, 26000, 0.75, 0.1692, 'manual'),
    (v_l_comp, '2026-11-01', 0.9, 26000, 0.75, 0.1692, 'manual'),
    (v_l_comp, '2026-12-01', 1.5, 26000, 0.75, 0.1692, 'manual');

  -- 4.2 Casa en exclusiva: ticket $37,000, margen 58.65%, ops: 0 / 0 / 0
  INSERT INTO public.fin_supuestos_mes (linea_id, mes, operaciones_manual, ticket_promedio, margen_pct, pct_comision_asesor, fuente)
  VALUES
    (v_l_excl, '2026-10-01', 0.0, 37000, 0.5865, 0.0, 'manual'),
    (v_l_excl, '2026-11-01', 0.0, 37000, 0.5865, 0.0, 'manual'),
    (v_l_excl, '2026-12-01', 0.0, 37000, 0.5865, 0.0, 'manual');

  -- 4.3 Solo trámite INFONAVIT: ticket $15,000, neto $8,500 (margen 56.67%), ops: 0.4 / 0.6 / 1.0
  INSERT INTO public.fin_supuestos_mes (linea_id, mes, operaciones_manual, ticket_promedio, margen_pct, pct_comision_asesor, fuente)
  VALUES
    (v_l_tram, '2026-10-01', 0.4, 15000, 0.5667, 0.0, 'manual'),
    (v_l_tram, '2026-11-01', 0.6, 15000, 0.5667, 0.0, 'manual'),
    (v_l_tram, '2026-12-01', 1.0, 15000, 0.5667, 0.0, 'manual');

  -- 4.4 Remodelación: ticket $12,000 de margen, costo asesor 20% ($2,400), neto $9,600, ops: 0.2 / 0.3 / 0.5
  INSERT INTO public.fin_supuestos_mes (linea_id, mes, operaciones_manual, ticket_promedio, margen_pct, pct_comision_asesor, fuente)
  VALUES
    (v_l_remo, '2026-10-01', 0.2, 12000, 1.0, 0.20, 'manual'),
    (v_l_remo, '2026-11-01', 0.3, 12000, 1.0, 0.20, 'manual'),
    (v_l_remo, '2026-12-01', 0.5, 12000, 1.0, 0.20, 'manual');

  -- 5. Gastos fijos de Bienes Raíces: anuncios $1,500/mes + otros $1,500/mes ($3,000/mes)
  INSERT INTO public.fin_fijos_plan (escenario_id, business_unit_id, concepto, linea_pnl, mes, monto, fuente)
  VALUES
    (v_esc_id, v_bu_br, 'Anuncios Meta Ads Bienes Raíces', 'costo_marketing', '2026-10-01', 1500, 'manual'),
    (v_esc_id, v_bu_br, 'Otros Gastos Fijos Operativos', 'opex_otros', '2026-10-01', 1500, 'manual'),
    (v_esc_id, v_bu_br, 'Anuncios Meta Ads Bienes Raíces', 'costo_marketing', '2026-11-01', 1500, 'manual'),
    (v_esc_id, v_bu_br, 'Otros Gastos Fijos Operativos', 'opex_otros', '2026-11-01', 1500, 'manual'),
    (v_esc_id, v_bu_br, 'Anuncios Meta Ads Bienes Raíces', 'costo_marketing', '2026-12-01', 1500, 'manual'),
    (v_esc_id, v_bu_br, 'Otros Gastos Fijos Operativos', 'opex_otros', '2026-12-01', 1500, 'manual');

  RAISE NOTICE 'Escenario Base Q4 2026 inicializado correctamente con id: %', v_esc_id;
END;
$$;
