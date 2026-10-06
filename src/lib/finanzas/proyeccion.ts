/**
 * Motor determinístico de cálculo de proyecciones financieras para CRM SAUCEDA.
 * Realiza proyecciones mensuales de P&L, contribución marginal, gastos fijos y flujo de caja.
 *
 * REGLA DE ORO: La proyección es un cálculo matemático 100% determinístico.
 * Sofía (IA) solo comenta o emite diagnósticos sobre los resultados ya calculados.
 */

export interface EsquemaCobroItem {
  pct: number; // Porcentaje de cobro (0 a 1)
  desfase_meses: number; // 0 = mismo mes, 1 = mes siguiente, etc.
}

export interface LineaPlan {
  id: string;
  escenario_id: string;
  business_unit_id: string | null;
  business_unit_nombre?: string;
  nombre: string;
  tipo_negocio: string | null;
  origen: "existente" | "nuevo";
  modelo: "embudo" | "manual";
  esquema_cobro: EsquemaCobroItem[];
  activo: boolean;
  orden: number;
}

export interface SupuestoMes {
  id?: string;
  linea_id: string;
  mes: string; // 'YYYY-MM-01'
  leads?: number | null;
  pct_a_cotizacion?: number | null; // 0..1 o %
  pct_cierre?: number | null; // 0..1 o %
  operaciones_manual?: number | null;
  ticket_promedio?: number | null;
  margen_pct?: number | null; // 0..1 o %
  pct_comision_asesor?: number | null; // 0..1 o %
  gasto_ads?: number | null;
  costo_por_lead?: number | null;
  fuente?: "real" | "promedio_real" | "manual";
}

export interface FijoPlan {
  id?: string;
  escenario_id: string;
  business_unit_id: string | null;
  business_unit_nombre?: string;
  concepto: string;
  linea_pnl: string;
  mes: string; // 'YYYY-MM-01'
  monto: number;
  fuente?: string;
}

export interface ResultadoLineaMes {
  linea_id: string;
  mes: string;
  operaciones: number;
  ingreso_bruto: number;
  costo_directo: number;
  comision_asesor: number;
  utilidad_bruta: number;
  marketing: number;
  contribucion: number;
  cobro_caja: number;
}

export interface ResultadoLineaTotal {
  linea_id: string;
  nombre: string;
  business_unit_id: string | null;
  business_unit_nombre: string;
  modelo: "embudo" | "manual";
  por_mes: Record<string, ResultadoLineaMes>;
  total: ResultadoLineaMes;
}

export interface ResultadoUnidadMes {
  business_unit_id: string | null;
  business_unit_nombre: string;
  mes: string;
  operaciones: number;
  ingreso_bruto: number;
  costo_directo: number;
  comision_asesor: number;
  utilidad_bruta: number;
  marketing: number;
  contribucion: number;
  gastos_fijos: number;
  utilidad_operativa: number;
  margen_operativo_pct: number;
  cobro_caja: number;
  salidas_caja: number;
  flujo_neto_caja: number;
}

export interface ResultadoUnidadTotal {
  business_unit_id: string | null;
  business_unit_nombre: string;
  por_mes: Record<string, ResultadoUnidadMes>;
  total: ResultadoUnidadMes;
}

export interface ResultadoConsolidadoMes {
  mes: string;
  operaciones: number;
  ingreso_bruto: number;
  costo_directo: number;
  comision_asesor: number;
  utilidad_bruta: number;
  marketing: number;
  contribucion: number;
  gastos_fijos: number;
  utilidad_operativa: number;
  utilidad_acumulada: number;
  margen_operativo_pct: number;
  cobro_caja: number;
  salidas_caja: number;
  flujo_neto_caja: number;
  saldo_caja_acumulado: number;
}

export interface ResultadoProyeccion {
  meses: string[];
  por_linea: Record<string, ResultadoLineaTotal>;
  por_unidad: Record<string, ResultadoUnidadTotal>;
  consolidado: {
    por_mes: Record<string, ResultadoConsolidadoMes>;
    total: ResultadoConsolidadoMes;
  };
  kpis: {
    ingreso_total: number;
    utilidad_bruta_total: number;
    utilidad_operativa_total: number;
    margen_pct: number;
    punto_equilibrio_mes: string | null;
    caja_minima: number;
    saldo_caja_final: number;
  };
}

/**
 * Normaliza valores decimales o porcentuales.
 * Si es mayor que 1 y menor o igual a 100, se asume porcentaje entero (ej. 15 -> 0.15).
 */
export function normalizarPorcentaje(val: number | null | undefined): number {
  if (val === null || val === undefined || isNaN(val)) return 0;
  if (val > 1 && val <= 100) return val / 100;
  return val;
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Proyecta el P&L mensual por servicio, por unidad de negocio y consolidado,
 * más el flujo de caja con esquemas de desfase de cobro.
 *
 * @param lineas Líneas de negocio del escenario (activas o inactivas)
 * @param supuestos Valores de supuestos para cada línea y mes
 * @param fijos Gastos fijos programados por mes y unidad
 * @param saldoInicialCaja Saldo en bancos inicial para la proyección de flujo (default 0)
 */
export function proyectar(
  lineas: LineaPlan[],
  supuestos: SupuestoMes[],
  fijos: FijoPlan[],
  saldoInicialCaja = 0
): ResultadoProyeccion {
  const lineasActivas = lineas.filter((l) => l.activo !== false);

  // 1. Determinar lista ordenada de meses únicos
  const mesesSet = new Set<string>();
  supuestos.forEach((s) => {
    if (s.mes) mesesSet.add(s.mes.slice(0, 7) + "-01");
  });
  fijos.forEach((f) => {
    if (f.mes) mesesSet.add(f.mes.slice(0, 7) + "-01");
  });
  const meses = Array.from(mesesSet).sort();

  // Indexar supuestos por clave `linea_id:mes`
  const supuestosMap = new Map<string, SupuestoMes>();
  supuestos.forEach((s) => {
    const mesNorm = s.mes.slice(0, 7) + "-01";
    supuestosMap.set(`${s.linea_id}:${mesNorm}`, s);
  });

  // Mapear nombres de unidades de negocio
  const buNombres = new Map<string, string>();
  lineas.forEach((l) => {
    if (l.business_unit_id && l.business_unit_nombre) {
      buNombres.set(l.business_unit_id, l.business_unit_nombre);
    }
  });
  fijos.forEach((f) => {
    if (f.business_unit_id && f.business_unit_nombre) {
      buNombres.set(f.business_unit_id, f.business_unit_nombre);
    }
  });

  // 2. Estructura de resultados por línea
  const porLinea: Record<string, ResultadoLineaTotal> = {};

  // Inicializar acumuladores de cobro en caja por mes para cada línea
  // clave: `${linea_id}:${mes}` -> monto a cobrar
  const cobrosEnCajaPorLinea = new Map<string, number>();

  lineasActivas.forEach((linea) => {
    const buNombre = linea.business_unit_id
      ? buNombres.get(linea.business_unit_id) || "Sin Unidad"
      : "Sin Unidad";

    porLinea[linea.id] = {
      linea_id: linea.id,
      nombre: linea.nombre,
      business_unit_id: linea.business_unit_id,
      business_unit_nombre: buNombre,
      modelo: linea.modelo,
      por_mes: {},
      total: {
        linea_id: linea.id,
        mes: "TOTAL",
        operaciones: 0,
        ingreso_bruto: 0,
        costo_directo: 0,
        comision_asesor: 0,
        utilidad_bruta: 0,
        marketing: 0,
        contribucion: 0,
        cobro_caja: 0
      }
    };
  });

  // Paso 2a: Calcular P&L operativo por línea y programar cobros futuros
  lineasActivas.forEach((linea) => {
    meses.forEach((mes, mesIndex) => {
      const supuesto = supuestosMap.get(`${linea.id}:${mes}`);

      let operaciones = 0;
      if (linea.modelo === "manual") {
        operaciones = Number(supuesto?.operaciones_manual || 0);
      } else {
        const leads = Number(supuesto?.leads || 0);
        const pctCot = normalizarPorcentaje(supuesto?.pct_a_cotizacion);
        const pctCie = normalizarPorcentaje(supuesto?.pct_cierre);
        operaciones = leads * pctCot * pctCie;
      }

      const ticket = Number(supuesto?.ticket_promedio || 0);
      const margenPct = normalizarPorcentaje(supuesto?.margen_pct);
      const comisionAsesorPct = normalizarPorcentaje(supuesto?.pct_comision_asesor);

      const ingreso_bruto = r2(operaciones * ticket);
      const costo_directo = r2(ingreso_bruto * (1 - margenPct));
      const comision_asesor = r2(ingreso_bruto * comisionAsesorPct);
      const utilidad_bruta = r2(ingreso_bruto - costo_directo - comision_asesor);

      let marketing = 0;
      if (supuesto?.gasto_ads !== null && supuesto?.gasto_ads !== undefined) {
        marketing = Number(supuesto.gasto_ads);
      } else {
        const leads = Number(supuesto?.leads || 0);
        const costoPorLead = Number(supuesto?.costo_por_lead || 0);
        marketing = leads * costoPorLead;
      }
      marketing = r2(marketing);

      const contribucion = r2(utilidad_bruta - marketing);

      // Programar cobros según esquema_cobro
      const esquema =
        linea.esquema_cobro && linea.esquema_cobro.length > 0
          ? linea.esquema_cobro
          : [{ pct: 1, desfase_meses: 0 }];

      esquema.forEach((hito) => {
        const hitoPct = normalizarPorcentaje(hito.pct);
        const desfase = Math.max(0, Math.floor(hito.desfase_meses || 0));
        const mesDestinoIdx = mesIndex + desfase;

        if (mesDestinoIdx < meses.length) {
          const mesDestino = meses[mesDestinoIdx];
          const claveCobro = `${linea.id}:${mesDestino}`;
          const cobro = r2(ingreso_bruto * hitoPct);
          cobrosEnCajaPorLinea.set(
            claveCobro,
            r2((cobrosEnCajaPorLinea.get(claveCobro) || 0) + cobro)
          );
        }
      });

      const resMes: ResultadoLineaMes = {
        linea_id: linea.id,
        mes,
        operaciones: r2(operaciones),
        ingreso_bruto,
        costo_directo,
        comision_asesor,
        utilidad_bruta,
        marketing,
        contribucion,
        cobro_caja: 0 // Se completará después de consolidar desfases
      };

      porLinea[linea.id].por_mes[mes] = resMes;
    });
  });

  // Paso 2b: Asignar cobro_caja a cada mes de la línea y acumular totales
  lineasActivas.forEach((linea) => {
    meses.forEach((mes) => {
      const cobro = cobrosEnCajaPorLinea.get(`${linea.id}:${mes}`) || 0;
      const resMes = porLinea[linea.id].por_mes[mes];
      resMes.cobro_caja = r2(cobro);

      const tot = porLinea[linea.id].total;
      tot.operaciones = r2(tot.operaciones + resMes.operaciones);
      tot.ingreso_bruto = r2(tot.ingreso_bruto + resMes.ingreso_bruto);
      tot.costo_directo = r2(tot.costo_directo + resMes.costo_directo);
      tot.comision_asesor = r2(tot.comision_asesor + resMes.comision_asesor);
      tot.utilidad_bruta = r2(tot.utilidad_bruta + resMes.utilidad_bruta);
      tot.marketing = r2(tot.marketing + resMes.marketing);
      tot.contribucion = r2(tot.contribucion + resMes.contribucion);
      tot.cobro_caja = r2(tot.cobro_caja + resMes.cobro_caja);
    });
  });

  // 3. Agrupación por Unidad de Negocio
  const unidadesMap = new Map<string, Set<string>>(); // buId -> Set(lineaIds)
  lineasActivas.forEach((l) => {
    const buId = l.business_unit_id || "sin_unidad";
    if (!unidadesMap.has(buId)) unidadesMap.set(buId, new Set());
    unidadesMap.get(buId)!.add(l.id);
  });
  fijos.forEach((f) => {
    const buId = f.business_unit_id || "sin_unidad";
    if (!unidadesMap.has(buId)) unidadesMap.set(buId, new Set());
  });

  // Indexar fijos por buId y mes
  const fijosPorBuYMes = new Map<string, number>();
  fijos.forEach((f) => {
    const buId = f.business_unit_id || "sin_unidad";
    const mesNorm = f.mes.slice(0, 7) + "-01";
    const key = `${buId}:${mesNorm}`;
    fijosPorBuYMes.set(key, r2((fijosPorBuYMes.get(key) || 0) + Number(f.monto || 0)));
  });

  const porUnidad: Record<string, ResultadoUnidadTotal> = {};

  unidadesMap.forEach((lineaIds, buId) => {
    const buNombre =
      buId === "sin_unidad"
        ? "Sin Unidad Asignada"
        : buNombres.get(buId) || "Unidad " + buId.slice(0, 8);

    porUnidad[buId] = {
      business_unit_id: buId === "sin_unidad" ? null : buId,
      business_unit_nombre: buNombre,
      por_mes: {},
      total: {
        business_unit_id: buId === "sin_unidad" ? null : buId,
        business_unit_nombre: buNombre,
        mes: "TOTAL",
        operaciones: 0,
        ingreso_bruto: 0,
        costo_directo: 0,
        comision_asesor: 0,
        utilidad_bruta: 0,
        marketing: 0,
        contribucion: 0,
        gastos_fijos: 0,
        utilidad_operativa: 0,
        margen_operativo_pct: 0,
        cobro_caja: 0,
        salidas_caja: 0,
        flujo_neto_caja: 0
      }
    };

    meses.forEach((mes) => {
      let ops = 0;
      let ing = 0;
      let cdir = 0;
      let com = 0;
      let ubr = 0;
      let mkt = 0;
      let con = 0;
      let cobro = 0;

      lineaIds.forEach((lId) => {
        const r = porLinea[lId]?.por_mes[mes];
        if (r) {
          ops += r.operaciones;
          ing += r.ingreso_bruto;
          cdir += r.costo_directo;
          com += r.comision_asesor;
          ubr += r.utilidad_bruta;
          mkt += r.marketing;
          con += r.contribucion;
          cobro += r.cobro_caja;
        }
      });

      const gf = fijosPorBuYMes.get(`${buId}:${mes}`) || 0;
      const uOp = r2(con - gf);
      const salidas = r2(cdir + com + mkt + gf);
      const flujoNeto = r2(cobro - salidas);
      const margenOpPct = ing > 0 ? r2((uOp / ing) * 100) : 0;

      const resBuMes: ResultadoUnidadMes = {
        business_unit_id: buId === "sin_unidad" ? null : buId,
        business_unit_nombre: buNombre,
        mes,
        operaciones: r2(ops),
        ingreso_bruto: r2(ing),
        costo_directo: r2(cdir),
        comision_asesor: r2(com),
        utilidad_bruta: r2(ubr),
        marketing: r2(mkt),
        contribucion: r2(con),
        gastos_fijos: r2(gf),
        utilidad_operativa: uOp,
        margen_operativo_pct: margenOpPct,
        cobro_caja: r2(cobro),
        salidas_caja: salidas,
        flujo_neto_caja: flujoNeto
      };

      porUnidad[buId].por_mes[mes] = resBuMes;

      const totBu = porUnidad[buId].total;
      totBu.operaciones = r2(totBu.operaciones + resBuMes.operaciones);
      totBu.ingreso_bruto = r2(totBu.ingreso_bruto + resBuMes.ingreso_bruto);
      totBu.costo_directo = r2(totBu.costo_directo + resBuMes.costo_directo);
      totBu.comision_asesor = r2(totBu.comision_asesor + resBuMes.comision_asesor);
      totBu.utilidad_bruta = r2(totBu.utilidad_bruta + resBuMes.utilidad_bruta);
      totBu.marketing = r2(totBu.marketing + resBuMes.marketing);
      totBu.contribucion = r2(totBu.contribucion + resBuMes.contribucion);
      totBu.gastos_fijos = r2(totBu.gastos_fijos + resBuMes.gastos_fijos);
      totBu.utilidad_operativa = r2(totBu.utilidad_operativa + resBuMes.utilidad_operativa);
      totBu.cobro_caja = r2(totBu.cobro_caja + resBuMes.cobro_caja);
      totBu.salidas_caja = r2(totBu.salidas_caja + resBuMes.salidas_caja);
      totBu.flujo_neto_caja = r2(totBu.flujo_neto_caja + resBuMes.flujo_neto_caja);
    });

    const totBu = porUnidad[buId].total;
    totBu.margen_operativo_pct =
      totBu.ingreso_bruto > 0 ? r2((totBu.utilidad_operativa / totBu.ingreso_bruto) * 100) : 0;
  });

  // 4. Consolidado General (Todas las unidades de negocio)
  const consolidadoPorMes: Record<string, ResultadoConsolidadoMes> = {};
  let utilidadAcumulada = 0;
  let saldoCajaAcumulado = saldoInicialCaja;
  let puntoEquilibrioMes: string | null = null;
  let cajaMinima = saldoInicialCaja;

  const consolidadoTotal: ResultadoConsolidadoMes = {
    mes: "TOTAL",
    operaciones: 0,
    ingreso_bruto: 0,
    costo_directo: 0,
    comision_asesor: 0,
    utilidad_bruta: 0,
    marketing: 0,
    contribucion: 0,
    gastos_fijos: 0,
    utilidad_operativa: 0,
    utilidad_acumulada: 0,
    margen_operativo_pct: 0,
    cobro_caja: 0,
    salidas_caja: 0,
    flujo_neto_caja: 0,
    saldo_caja_acumulado: 0
  };

  meses.forEach((mes) => {
    let ops = 0;
    let ing = 0;
    let cdir = 0;
    let com = 0;
    let ubr = 0;
    let mkt = 0;
    let con = 0;
    let gf = 0;
    let cobro = 0;
    let salidas = 0;

    Object.values(porUnidad).forEach((u) => {
      const r = u.por_mes[mes];
      if (r) {
        ops += r.operaciones;
        ing += r.ingreso_bruto;
        cdir += r.costo_directo;
        com += r.comision_asesor;
        ubr += r.utilidad_bruta;
        mkt += r.marketing;
        con += r.contribucion;
        gf += r.gastos_fijos;
        cobro += r.cobro_caja;
        salidas += r.salidas_caja;
      }
    });

    const uOp = r2(con - gf);
    utilidadAcumulada = r2(utilidadAcumulada + uOp);

    if (puntoEquilibrioMes === null && utilidadAcumulada >= 0) {
      puntoEquilibrioMes = mes;
    }

    const flujoNeto = r2(cobro - salidas);
    saldoCajaAcumulado = r2(saldoCajaAcumulado + flujoNeto);
    if (saldoCajaAcumulado < cajaMinima) {
      cajaMinima = saldoCajaAcumulado;
    }

    const margenOpPct = ing > 0 ? r2((uOp / ing) * 100) : 0;

    const resMesConsolidado: ResultadoConsolidadoMes = {
      mes,
      operaciones: r2(ops),
      ingreso_bruto: r2(ing),
      costo_directo: r2(cdir),
      comision_asesor: r2(com),
      utilidad_bruta: r2(ubr),
      marketing: r2(mkt),
      contribucion: r2(con),
      gastos_fijos: r2(gf),
      utilidad_operativa: uOp,
      utilidad_acumulada: utilidadAcumulada,
      margen_operativo_pct: margenOpPct,
      cobro_caja: r2(cobro),
      salidas_caja: r2(salidas),
      flujo_neto_caja: flujoNeto,
      saldo_caja_acumulado: saldoCajaAcumulado
    };

    consolidadoPorMes[mes] = resMesConsolidado;

    consolidadoTotal.operaciones = r2(consolidadoTotal.operaciones + resMesConsolidado.operaciones);
    consolidadoTotal.ingreso_bruto = r2(consolidadoTotal.ingreso_bruto + resMesConsolidado.ingreso_bruto);
    consolidadoTotal.costo_directo = r2(consolidadoTotal.costo_directo + resMesConsolidado.costo_directo);
    consolidadoTotal.comision_asesor = r2(consolidadoTotal.comision_asesor + resMesConsolidado.comision_asesor);
    consolidadoTotal.utilidad_bruta = r2(consolidadoTotal.utilidad_bruta + resMesConsolidado.utilidad_bruta);
    consolidadoTotal.marketing = r2(consolidadoTotal.marketing + resMesConsolidado.marketing);
    consolidadoTotal.contribucion = r2(consolidadoTotal.contribucion + resMesConsolidado.contribucion);
    consolidadoTotal.gastos_fijos = r2(consolidadoTotal.gastos_fijos + resMesConsolidado.gastos_fijos);
    consolidadoTotal.utilidad_operativa = r2(consolidadoTotal.utilidad_operativa + resMesConsolidado.utilidad_operativa);
    consolidadoTotal.cobro_caja = r2(consolidadoTotal.cobro_caja + resMesConsolidado.cobro_caja);
    consolidadoTotal.salidas_caja = r2(consolidadoTotal.salidas_caja + resMesConsolidado.salidas_caja);
    consolidadoTotal.flujo_neto_caja = r2(consolidadoTotal.flujo_neto_caja + resMesConsolidado.flujo_neto_caja);
  });

  consolidadoTotal.utilidad_acumulada = utilidadAcumulada;
  consolidadoTotal.saldo_caja_acumulado = saldoCajaAcumulado;
  consolidadoTotal.margen_operativo_pct =
    consolidadoTotal.ingreso_bruto > 0
      ? r2((consolidadoTotal.utilidad_operativa / consolidadoTotal.ingreso_bruto) * 100)
      : 0;

  return {
    meses,
    por_linea: porLinea,
    por_unidad: porUnidad,
    consolidado: {
      por_mes: consolidadoPorMes,
      total: consolidadoTotal
    },
    kpis: {
      ingreso_total: consolidadoTotal.ingreso_bruto,
      utilidad_bruta_total: consolidadoTotal.utilidad_bruta,
      utilidad_operativa_total: consolidadoTotal.utilidad_operativa,
      margen_pct: consolidadoTotal.margen_operativo_pct,
      punto_equilibrio_mes: puntoEquilibrioMes,
      caja_minima: cajaMinima,
      saldo_caja_final: saldoCajaAcumulado
    }
  };
}
