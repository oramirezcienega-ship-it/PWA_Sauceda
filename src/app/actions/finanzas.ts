"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { modeloClaude, opcionesClaude, textoDeRespuesta } from "@/lib/ia/claude";

// ============================================================
// TIPOS E INTERFACES DEL MÓDULO FINANZAS
// ============================================================

export type LineaPnL =
  | "ingresos_comisiones"
  | "ingresos_ventas"
  | "ingresos_otros"
  | "costo_directo"
  | "costo_comisiones_venta"
  | "costo_marketing"
  | "opex_nomina"
  | "opex_comisiones_visitas"
  | "opex_renta"
  | "opex_servicios"
  | "opex_otros"
  | "gastos_financieros"
  | "isr"
  | "no_pnl";

export type SubtipoNoPnL =
  | "aportacion_capital"
  | "retiro_dueno"
  | "prestamo_recibido"
  | "pago_prestamo"
  | "compra_equipo"
  | "traspaso";

export interface BusinessUnit {
  id: string;
  nombre: string;
  codigo?: string | null;
  descripcion?: string | null;
  activo: boolean;
  created_at?: string;
}

export interface MoneyAccount {
  id: string;
  nombre: string;
  tipo: "efectivo" | "banco" | "tarjeta_credito";
  saldo_inicial: number;
  fecha_saldo_inicial: string;
  numero_cuenta?: string | null;
  activo: boolean;
  created_at?: string;
  saldo_actual?: number;
}

export interface Category {
  id: string;
  nombre: string;
  tipo: "ingreso" | "egreso";
  linea_pnl: LineaPnL;
  activo: boolean;
  created_at?: string;
}

export interface Transaction {
  id: string;
  fecha_operacion: string;
  fecha_pago?: string | null;
  tipo: "ingreso" | "egreso" | "traspaso";
  subtipo_no_pnl?: SubtipoNoPnL | null;
  categoria_id?: string | null;
  business_unit_id?: string | null;
  money_account_id?: string | null;
  money_account_destino_id?: string | null;
  monto_total: number;
  subtotal?: number | null;
  iva?: number | null;
  concepto: string;
  contraparte?: string | null;
  crm_deal_id?: string | null;
  comprobante_url?: string | null;
  cfdi_uuid?: string | null;
  estado: "pagado" | "pendiente";
  is_demo: boolean;
  codigo_subcuenta?: string | null;
  producto_servicio_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  // Campos enriquecidos por joins
  categoria_nombre?: string;
  linea_pnl?: LineaPnL;
  business_unit_nombre?: string;
  money_account_nombre?: string;
  money_account_destino_nombre?: string;
  expediente_cliente?: string;
}

export interface AlertaFinanciera {
  tipo: "danger" | "warning" | "info" | "success";
  titulo: string;
  descripcion: string;
  metrica?: string;
}

export interface ResumenFinanciero {
  periodo: { inicio: string; fin: string };
  periodoPrev: { inicio: string; fin: string };
  ingresos: number;
  ingresosPrev: number;
  variacionIngresos: number;
  egresos: number;
  egresosPrev: number;
  variacionEgresos: number;
  utilidadNeta: number;
  utilidadNetaPrev: number;
  variacionUtilidad: number;
  margenNeto: number;
  margenNetoPrev: number;
  variacionMargen: number;
  efectivoDisponible: number;
  porCobrar: number;
  porPagar: number;
  mesesOperacionCubiertos: number;
  puntoEquilibrio: {
    gastoFijoMensual: number;
    ventasRequeridas: number;
    operacionesRequeridas: number;
  };
  rentabilidadPorUnidad: Array<{
    unidad_id: string;
    nombre: string;
    ingresos: number;
    egresos: number;
    utilidad: number;
    margen: number;
  }>;
  topOperacionesCRM: Array<{
    expediente_id: string;
    cliente: string;
    monto_ingreso: number;
    costo_directo: number;
    margen_bruto: number;
    margen_pct: number;
  }>;
  alertas: AlertaFinanciera[];
  diagnosticoSofia?: {
    fecha: string;
    periodo: string;
    estado_salud: "excelente" | "regular" | "critico";
    diagnostico_general: string;
    alertas: string[];
    oportunidades: string[];
  } | null;
}

export interface LineaPnLReporte {
  clave: string;
  concepto: string;
  esEncabezado?: boolean;
  esTotal?: boolean;
  monto: number;
  porcentajeVertical: number;
  mensual: Record<string, number>; // "YYYY-MM" -> monto
}

export interface EstadoResultadosReporte {
  lineas: LineaPnLReporte[];
  meses: string[];
  totales: {
    ingresos: number;
    costoDirecto: number;
    marketing: number;
    utilidadBruta: number;
    margenBrutoPct: number;
    opex: number;
    ebit: number;
    margenOperativoPct: number;
    gastosFinancieros: number;
    utilidadAntesImpuestos: number;
    isr: number;
    utilidadNeta: number;
    margenNetoPct: number;
  };
}

export interface BalanceGeneralReporte {
  fechaCorte: string;
  fechaCortePrev?: string;
  activo: {
    circulante: {
      efectivoYBancos: { total: number; cuentas: Array<{ nombre: string; saldo: number }> };
      cuentasPorCobrar: number;
      ivaAFavor: number;
      totalCirculante: number;
    };
    noCirculante: {
      activoFijoNeto: number;
      depreciacionAcumulada: number;
      totalNoCirculante: number;
    };
    totalActivo: number;
  };
  pasivo: {
    cortoPlazo: {
      cuentasPorPagar: number;
      tarjetasCredito: number;
      impuestosPorPagar: number;
      totalCortoPlazo: number;
    };
    largoPlazo: {
      prestamos: number;
      totalLargoPlazo: number;
    };
    totalPasivo: number;
  };
  capital: {
    aportaciones: number;
    retiros: number;
    utilidadesAnteriores: number;
    utilidadEjercicio: number;
    totalCapital: number;
  };
  totalPasivoYCapital: number;
  estaCuadrado: boolean;
  diferencia: number;
  previo?: {
    totalActivo: number;
    totalPasivo: number;
    totalCapital: number;
  };
}

export interface FlujoEfectivoReporte {
  saldoInicial: number;
  operacion: {
    cobrosClientes: number;
    pagosProveedoresCostos: number;
    pagosMarketing: number;
    pagosNomina: number;
    pagosRentaServicios: number;
    pagosImpuestos: number;
    flujoNetoOperacion: number;
  };
  inversion: {
    compraEquipoActivo: number;
    flujoNetoInversion: number;
  };
  financiamiento: {
    aportacionesCapital: number;
    retirosDueno: number;
    prestamosRecibidos: number;
    pagosPrestamos: number;
    flujoNetoFinanciamiento: number;
  };
  flujoNetoTotal: number;
  saldoFinal: number;
  meses: Array<{
    mes: string;
    saldoInicial: number;
    entradas: number;
    salidas: number;
    flujoNeto: number;
    saldoFinal: number;
  }>;
}

export interface CuentaPendienteItem {
  id: string;
  fecha_operacion: string;
  concepto: string;
  contraparte: string;
  monto: number;
  diasAntiguedad: number;
  tramo: "0-30" | "31-60" | "60+";
  categoria_nombre: string;
  business_unit_nombre: string;
  crm_deal_id?: string | null;
}

// ============================================================
// FUNCIONES DE CONSULTA Y CATÁLOGOS
// ============================================================

export async function obtenerCatalogosFinanzas(): Promise<{
  businessUnits: BusinessUnit[];
  moneyAccounts: MoneyAccount[];
  categories: Category[];
}> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const [resBU, resMA, resCat] = await Promise.all([
    sb.from("business_units").select("*").eq("activo", true).order("nombre"),
    sb.from("money_accounts").select("*").eq("activo", true).order("nombre"),
    sb.from("categories").select("*").eq("activo", true).order("nombre")
  ]);

  if (resBU.error) throw new Error(resBU.error.message);
  if (resMA.error) throw new Error(resMA.error.message);
  if (resCat.error) throw new Error(resCat.error.message);

  // Calcular saldo actual de cada cuenta de dinero
  const accounts: MoneyAccount[] = (resMA.data || []).map((acc: any) => ({
    id: acc.id,
    nombre: acc.nombre,
    tipo: acc.tipo,
    saldo_inicial: Number(acc.saldo_inicial || 0),
    fecha_saldo_inicial: acc.fecha_saldo_inicial,
    numero_cuenta: acc.numero_cuenta,
    activo: acc.activo,
    created_at: acc.created_at,
    saldo_actual: Number(acc.saldo_inicial || 0)
  }));

  // Obtener movimientos pagados para acumular saldos
  const { data: txs } = await sb
    .from("transactions")
    .select("tipo, subtipo_no_pnl, money_account_id, money_account_destino_id, monto_total")
    .eq("estado", "pagado");

  if (txs) {
    const mapa = new Map<string, number>();
    accounts.forEach(a => mapa.set(a.id, a.saldo_inicial));

    txs.forEach((t: any) => {
      const monto = Number(t.monto_total || 0);
      if (t.tipo === "ingreso") {
        if (t.money_account_id && mapa.has(t.money_account_id)) {
          mapa.set(t.money_account_id, mapa.get(t.money_account_id)! + monto);
        }
      } else if (t.tipo === "egreso") {
        if (t.money_account_id && mapa.has(t.money_account_id)) {
          mapa.set(t.money_account_id, mapa.get(t.money_account_id)! - monto);
        }
      } else if (t.tipo === "traspaso") {
        if (t.money_account_id && mapa.has(t.money_account_id)) {
          mapa.set(t.money_account_id, mapa.get(t.money_account_id)! - monto);
        }
        if (t.money_account_destino_id && mapa.has(t.money_account_destino_id)) {
          mapa.set(t.money_account_destino_id, mapa.get(t.money_account_destino_id)! + monto);
        }
      }
    });

    accounts.forEach(a => {
      a.saldo_actual = Number((mapa.get(a.id) || a.saldo_inicial).toFixed(2));
    });
  }

  return {
    businessUnits: resBU.data || [],
    moneyAccounts: accounts,
    categories: resCat.data || []
  };
}

// ============================================================
// RESUMEN FINANCIERO Y KPIS
// ============================================================

export async function obtenerResumenFinanciero(
  fechaInicio: string,
  fechaFin: string,
  fechaInicioPrev?: string,
  fechaFinPrev?: string,
  businessUnitId?: string
): Promise<ResumenFinanciero> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Fechas por defecto si no vienen
  const hoy = new Date();
  const fFin = fechaFin || hoy.toISOString().split("T")[0];
  const fInicio =
    fechaInicio ||
    new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0];

  // Periodo previo por defecto (mes anterior)
  const dInicio = new Date(fInicio + "T00:00:00");
  const dFin = new Date(fFin + "T00:00:00");
  const diasPeriodo = Math.max(
    1,
    Math.round((dFin.getTime() - dInicio.getTime()) / (1000 * 60 * 60 * 24))
  );

  const dInicioPrev = new Date(dInicio);
  dInicioPrev.setDate(dInicioPrev.getDate() - diasPeriodo);
  const dFinPrev = new Date(dInicio);
  dFinPrev.setDate(dFinPrev.getDate() - 1);

  const fInicioPrev = fechaInicioPrev || dInicioPrev.toISOString().split("T")[0];
  const fFinPrev = fechaFinPrev || dFinPrev.toISOString().split("T")[0];

  // 1. Transacciones periodo actual
  let qActual = sb
    .from("transactions")
    .select(`
      id, fecha_operacion, fecha_pago, tipo, subtipo_no_pnl, monto_total, concepto,
      estado, crm_deal_id, business_unit_id,
      categories ( nombre, linea_pnl ),
      business_units ( nombre )
    `)
    .gte("fecha_operacion", fInicio)
    .lte("fecha_operacion", fFin);

  if (businessUnitId && businessUnitId !== "todas") {
    qActual = qActual.eq("business_unit_id", businessUnitId);
  }

  // 2. Transacciones periodo previo
  let qPrev = sb
    .from("transactions")
    .select(`
      id, fecha_operacion, fecha_pago, tipo, subtipo_no_pnl, monto_total, concepto,
      estado, categories ( linea_pnl )
    `)
    .gte("fecha_operacion", fInicioPrev)
    .lte("fecha_operacion", fFinPrev);

  if (businessUnitId && businessUnitId !== "todas") {
    qPrev = qPrev.eq("business_unit_id", businessUnitId);
  }

  // 3. Cuentas de dinero (saldo total actual)
  const qAccounts = sb.from("money_accounts").select("*").eq("activo", true);

  // 4. Cuentas pendientes globales
  const qPendientes = sb
    .from("transactions")
    .select("tipo, monto_total, fecha_operacion, estado")
    .eq("estado", "pendiente");

  // 5. La publicidad solo cuenta en el P&L cuando ya es un movimiento contable
  // (transactions). Las tablas de campañas (analytics_marketing / meta_ads_gastos)
  // son la capa de métricas y se contabilizan con el importador de Meta Ads.

  // 6. Expedientes cerrados para atribución
  const qExpedientesCerrados = sb
    .from("expedientes")
    .select("id, cliente, valor_estimado")
    .eq("etapa", "cerrado");

  // 7. Último insight de Sofía
  const qInsight = sb
    .from("dashboard_insights")
    .select("*")
    .eq("tipo", "finanzas")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [
    resActual,
    resPrev,
    resAccounts,
    resPend,
    resExp,
    resIns
  ] = await Promise.all([
    qActual,
    qPrev,
    qAccounts,
    qPendientes,
    qExpedientesCerrados,
    qInsight
  ]);

  const txsActual = resActual.data || [];
  const txsPrev = resPrev.data || [];

  // La publicidad ya viene dentro de las transacciones (línea costo_marketing)
  const mktAdsActual = 0;
  const mktAdsPrev = 0;

  // Calcular métricas actuales
  let ingresos = 0;
  let costoDirecto = 0;
  let costoMarketing = mktAdsActual;
  let opex = 0;
  let gastosFinancieros = 0;
  let isr = 0;

  const desgloseCategoriasActual = new Map<string, number>();

  txsActual.forEach((t: any) => {
    const linea = t.categories?.linea_pnl as LineaPnL;
    const catNombre = t.categories?.nombre || "Otros";
    const monto = Number(t.monto_total || 0);

    if (t.tipo === "ingreso" && linea !== "no_pnl") {
      ingresos += monto;
    } else if (t.tipo === "egreso") {
      desgloseCategoriasActual.set(
        catNombre,
        (desgloseCategoriasActual.get(catNombre) || 0) + monto
      );

      if (linea === "costo_directo" || linea === "costo_comisiones_venta") costoDirecto += monto;
      else if (linea === "costo_marketing") costoMarketing += monto;
      else if (
        linea === "opex_nomina" ||
        linea === "opex_comisiones_visitas" ||
        linea === "opex_renta" ||
        linea === "opex_servicios" ||
        linea === "opex_otros"
      ) {
        opex += monto;
      } else if (linea === "gastos_financieros") gastosFinancieros += monto;
      else if (linea === "isr") isr += monto;
    }
  });

  const egresos = costoDirecto + costoMarketing + opex + gastosFinancieros + isr;
  const utilidadNeta = ingresos - egresos;
  const margenNeto = ingresos > 0 ? (utilidadNeta / ingresos) * 100 : 0;

  // Calcular métricas previas
  let ingresosPrev = 0;
  let egresosPrev = mktAdsPrev;
  const desgloseCategoriasPrev = new Map<string, number>();

  txsPrev.forEach((t: any) => {
    const linea = t.categories?.linea_pnl as LineaPnL;
    const catNombre = t.categories?.nombre || "Otros";
    const monto = Number(t.monto_total || 0);

    if (t.tipo === "ingreso" && linea !== "no_pnl") {
      ingresosPrev += monto;
    } else if (t.tipo === "egreso" && linea !== "no_pnl") {
      egresosPrev += monto;
      desgloseCategoriasPrev.set(
        catNombre,
        (desgloseCategoriasPrev.get(catNombre) || 0) + monto
      );
    }
  });

  const utilidadNetaPrev = ingresosPrev - egresosPrev;
  const margenNetoPrev =
    ingresosPrev > 0 ? (utilidadNetaPrev / ingresosPrev) * 100 : 0;

  // Variaciones
  const variacionIngresos =
    ingresosPrev > 0 ? ((ingresos - ingresosPrev) / ingresosPrev) * 100 : 0;
  const variacionEgresos =
    egresosPrev > 0 ? ((egresos - egresosPrev) / egresosPrev) * 100 : 0;
  const variacionUtilidad =
    utilidadNetaPrev !== 0
      ? ((utilidadNeta - utilidadNetaPrev) / Math.abs(utilidadNetaPrev)) * 100
      : 0;
  const variacionMargen = margenNeto - margenNetoPrev;

  // Efectivo disponible real de todas las cuentas de dinero
  const catalogos = await obtenerCatalogosFinanzas();
  const efectivoDisponible = catalogos.moneyAccounts
    .filter((a) => a.tipo !== "tarjeta_credito")
    .reduce((sum, a) => sum + (a.saldo_actual || 0), 0);

  // Por cobrar y Por pagar
  let porCobrar = 0;
  let porPagar = 0;
  let cuentasPorCobrarVencidas30 = 0;
  const fechaHoyStr = hoy.toISOString().split("T")[0];

  (resPend.data || []).forEach((p: any) => {
    const monto = Number(p.monto_total || 0);
    const dias = Math.round(
      (new Date(fechaHoyStr).getTime() - new Date(p.fecha_operacion).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (p.tipo === "ingreso") {
      porCobrar += monto;
      if (dias > 30) cuentasPorCobrarVencidas30 += monto;
    } else if (p.tipo === "egreso") {
      porPagar += monto;
    }
  });

  // Runway: Meses de operación cubiertos
  const gastoFijoMensual =
    diasPeriodo > 0 ? (opex / diasPeriodo) * 30 : opex;
  const mesesOperacionCubiertos =
    gastoFijoMensual > 0
      ? Number((efectivoDisponible / gastoFijoMensual).toFixed(1))
      : 99.0;

  // Punto de equilibrio
  const margenContribucionRatio =
    ingresos > 0 ? Math.max(0.1, (ingresos - costoDirecto) / ingresos) : 0.5;
  const ventasRequeridasPE = gastoFijoMensual / margenContribucionRatio;
  const ticketPromedio =
    ingresos > 0 && txsActual.filter((t: any) => t.tipo === "ingreso").length > 0
      ? ingresos / txsActual.filter((t: any) => t.tipo === "ingreso").length
      : 50000;
  const operacionesRequeridasPE = Math.ceil(ventasRequeridasPE / ticketPromedio);

  // Rentabilidad por unidad de negocio
  const buMap = new Map<
    string,
    { nombre: string; ingresos: number; egresos: number }
  >();
  catalogos.businessUnits.forEach((bu) => {
    buMap.set(bu.id, { nombre: bu.nombre, ingresos: 0, egresos: 0 });
  });

  txsActual.forEach((t: any) => {
    const linea = t.categories?.linea_pnl;
    if (linea === "no_pnl") return;
    const buId = t.business_unit_id;
    if (buId && buMap.has(buId)) {
      const obj = buMap.get(buId)!;
      const m = Number(t.monto_total || 0);
      if (t.tipo === "ingreso") obj.ingresos += m;
      else if (t.tipo === "egreso") obj.egresos += m;
    }
  });

  const rentabilidadPorUnidad = Array.from(buMap.entries()).map(
    ([unidad_id, val]) => {
      const utilidad = val.ingresos - val.egresos;
      const margen = val.ingresos > 0 ? (utilidad / val.ingresos) * 100 : 0;
      return {
        unidad_id,
        nombre: val.nombre,
        ingresos: Number(val.ingresos.toFixed(2)),
        egresos: Number(val.egresos.toFixed(2)),
        utilidad: Number(utilidad.toFixed(2)),
        margen: Number(margen.toFixed(1))
      };
    }
  );

  // Top operaciones CRM por margen
  const dealsMap = new Map<
    string,
    { cliente: string; ingreso: number; costo: number }
  >();
  txsActual.forEach((t: any) => {
    if (!t.crm_deal_id) return;
    const dealId = t.crm_deal_id;
    const linea = t.categories?.linea_pnl;
    const m = Number(t.monto_total || 0);
    const cliente = t.contraparte || `Expediente ${dealId}`;

    if (!dealsMap.has(dealId)) {
      dealsMap.set(dealId, { cliente, ingreso: 0, costo: 0 });
    }
    const item = dealsMap.get(dealId)!;
    if (t.tipo === "ingreso") item.ingreso += m;
    else if (t.tipo === "egreso" && (linea === "costo_directo" || linea === "costo_comisiones_venta")) item.costo += m;
  });

  const topOperacionesCRM = Array.from(dealsMap.entries())
    .map(([expediente_id, data]) => {
      const margen_bruto = data.ingreso - data.costo;
      const margen_pct =
        data.ingreso > 0 ? (margen_bruto / data.ingreso) * 100 : 0;
      return {
        expediente_id,
        cliente: data.cliente,
        monto_ingreso: data.ingreso,
        costo_directo: data.costo,
        margen_bruto,
        margen_pct
      };
    })
    .sort((a, b) => b.margen_bruto - a.margen_bruto)
    .slice(0, 5);

  // Alertas deterministas basadas en reglas matemáticas de datos reales
  const alertas: AlertaFinanciera[] = [];

  // Regla 1: Margen neto negativo
  if (ingresos > 0 && utilidadNeta < 0) {
    alertas.push({
      tipo: "danger",
      titulo: "Margen Neto Negativo",
      descripcion: `El negocio presenta una pérdida neta de -$${Math.abs(
        utilidadNeta
      ).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN en este periodo (${margenNeto.toFixed(1)}%).`,
      metrica: `${margenNeto.toFixed(1)}%`
    });
  }

  // Regla 2: Incremento de gasto de categoría >20% MoM
  for (const [catNombre, montoActual] of desgloseCategoriasActual.entries()) {
    const montoPrev = desgloseCategoriasPrev.get(catNombre) || 0;
    if (montoPrev > 1000 && montoActual > montoPrev * 1.2) {
      const incremento = ((montoActual - montoPrev) / montoPrev) * 100;
      alertas.push({
        tipo: "warning",
        titulo: `Aumento de Gasto: ${catNombre}`,
        descripcion: `El gasto en ${catNombre} aumentó un ${incremento.toFixed(
          1
        )}% respecto al periodo anterior ($${montoActual.toLocaleString()} vs $${montoPrev.toLocaleString()}).`,
        metrica: `+${incremento.toFixed(0)}%`
      });
    }
  }

  // Regla 3: Cuentas por cobrar vencidas >30 días
  if (cuentasPorCobrarVencidas30 > 0) {
    alertas.push({
      tipo: "danger",
      titulo: "Cuentas por Cobrar Vencidas (>30 días)",
      descripcion: `Existen $${cuentasPorCobrarVencidas30.toLocaleString(
        "es-MX",
        { minimumFractionDigits: 2 }
      )} MXN pendientes de cobro con más de 30 días de antigüedad.`,
      metrica: `$${cuentasPorCobrarVencidas30.toLocaleString()}`
    });
  }

  // Regla 4: Runway crítico (< 2 meses de gasto fijo)
  if (gastoFijoMensual > 0 && mesesOperacionCubiertos < 2) {
    alertas.push({
      tipo: "danger",
      titulo: "Reserva de Efectivo Crítica",
      descripcion: `El efectivo disponible ($${efectivoDisponible.toLocaleString()}) solo cubre ${mesesOperacionCubiertos} meses de gastos fijos operativos (mínimo recomendado: 3 meses).`,
      metrica: `${mesesOperacionCubiertos} meses`
    });
  }

  // Regla 5: Expedientes cerrados sin ingreso registrado
  const expedientesSinIngreso = (resExp.data || []).filter(
    (e: any) =>
      !txsActual.some(
        (t: any) => t.crm_deal_id === e.id && t.tipo === "ingreso"
      )
  );

  if (expedientesSinIngreso.length > 0) {
    alertas.push({
      tipo: "warning",
      titulo: "Ventas Cerradas sin Ingreso en Finanzas",
      descripcion: `Hay ${expedientesSinIngreso.length} expedientes en etapa 'Cerrado' en el CRM sin comisión registrada en este libro contable.`,
      metrica: `${expedientesSinIngreso.length} pendientes`
    });
  }

  // Si no hay datos
  if (txsActual.length === 0 && ingresos === 0 && egresos === 0) {
    alertas.push({
      tipo: "info",
      titulo: "Sin datos suficientes",
      descripcion:
        "No se registraron movimientos en el periodo seleccionado para calcular alertas contables."
    });
  } else if (alertas.length === 0) {
    alertas.push({
      tipo: "success",
      titulo: "Salud Financiera Estable",
      descripcion:
        "Todos los indicadores de rentabilidad, liquidez y cobranza se encuentran en rangos saludables."
    });
  }

  // Diagnóstico de Sofía guardado
  let diagnosticoSofia: ResumenFinanciero["diagnosticoSofia"] = null;
  if (resIns.data) {
    diagnosticoSofia = {
      fecha: resIns.data.fecha,
      periodo: `${fInicio} al ${fFin}`,
      estado_salud: resIns.data.estado_salud || "regular",
      diagnostico_general: resIns.data.diagnostico_general || "",
      alertas: Array.isArray(resIns.data.alertas) ? resIns.data.alertas : [],
      oportunidades: Array.isArray(resIns.data.oportunidades)
        ? resIns.data.oportunidades
        : []
    };
  }

  return {
    periodo: { inicio: fInicio, fin: fFin },
    periodoPrev: { inicio: fInicioPrev, fin: fFinPrev },
    ingresos: Number(ingresos.toFixed(2)),
    ingresosPrev: Number(ingresosPrev.toFixed(2)),
    variacionIngresos: Number(variacionIngresos.toFixed(1)),
    egresos: Number(egresos.toFixed(2)),
    egresosPrev: Number(egresosPrev.toFixed(2)),
    variacionEgresos: Number(variacionEgresos.toFixed(1)),
    utilidadNeta: Number(utilidadNeta.toFixed(2)),
    utilidadNetaPrev: Number(utilidadNetaPrev.toFixed(2)),
    variacionUtilidad: Number(variacionUtilidad.toFixed(1)),
    margenNeto: Number(margenNeto.toFixed(1)),
    margenNetoPrev: Number(margenNetoPrev.toFixed(1)),
    variacionMargen: Number(variacionMargen.toFixed(1)),
    efectivoDisponible: Number(efectivoDisponible.toFixed(2)),
    porCobrar: Number(porCobrar.toFixed(2)),
    porPagar: Number(porPagar.toFixed(2)),
    mesesOperacionCubiertos,
    puntoEquilibrio: {
      gastoFijoMensual: Number(gastoFijoMensual.toFixed(2)),
      ventasRequeridas: Number(ventasRequeridasPE.toFixed(2)),
      operacionesRequeridas: operacionesRequeridasPE
    },
    rentabilidadPorUnidad,
    topOperacionesCRM,
    alertas,
    diagnosticoSofia
  };
}

// ============================================================
// CRUD Y CONSULTA DE MOVIMIENTOS
// ============================================================

export async function obtenerMovimientosFinanzas(filtros: {
  fechaInicio?: string;
  fechaFin?: string;
  tipo?: "todos" | "ingreso" | "egreso" | "traspaso";
  categoriaId?: string;
  lineaPnl?: string;
  businessUnitId?: string;
  moneyAccountId?: string;
  estado?: "todos" | "pagado" | "pendiente";
  busqueda?: string;
  limite?: number;
  offset?: number;
}): Promise<{ total: number; movimientos: Transaction[] }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Al filtrar por línea del P&L se usa un inner join para que solo vuelvan
  // los movimientos cuya categoría pertenece a esa línea.
  const joinCategorias = filtros.lineaPnl ? "categories!inner" : "categories";

  let q = sb
    .from("transactions")
    .select(`
      *,
      ${joinCategorias} ( nombre, linea_pnl ),
      business_units ( nombre ),
      money_accounts!transactions_money_account_id_fkey ( nombre ),
      money_dest:money_accounts!transactions_money_account_destino_id_fkey ( nombre ),
      expedientes ( cliente )
    `, { count: "exact" });

  if (filtros.fechaInicio) q = q.gte("fecha_operacion", filtros.fechaInicio);
  if (filtros.fechaFin) q = q.lte("fecha_operacion", filtros.fechaFin);
  if (filtros.tipo && filtros.tipo !== "todos") q = q.eq("tipo", filtros.tipo);
  if (filtros.categoriaId && filtros.categoriaId !== "todas") q = q.eq("categoria_id", filtros.categoriaId);
  if (filtros.lineaPnl) q = q.eq("categories.linea_pnl", filtros.lineaPnl);
  if (filtros.businessUnitId && filtros.businessUnitId !== "todas") q = q.eq("business_unit_id", filtros.businessUnitId);
  if (filtros.moneyAccountId && filtros.moneyAccountId !== "todas") q = q.eq("money_account_id", filtros.moneyAccountId);
  if (filtros.estado && filtros.estado !== "todos") q = q.eq("estado", filtros.estado);

  if (filtros.busqueda && filtros.busqueda.trim()) {
    const term = filtros.busqueda.trim();
    q = q.or(`concepto.ilike.%${term}%,contraparte.ilike.%${term}%`);
  }

  q = q.order("fecha_operacion", { ascending: false });

  if (filtros.limite) {
    const offset = filtros.offset || 0;
    q = q.range(offset, offset + filtros.limite - 1);
  }

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);

  const movimientos: Transaction[] = (data || []).map((t: any) => ({
    id: t.id,
    fecha_operacion: t.fecha_operacion,
    fecha_pago: t.fecha_pago,
    tipo: t.tipo,
    subtipo_no_pnl: t.subtipo_no_pnl,
    categoria_id: t.categoria_id,
    business_unit_id: t.business_unit_id,
    money_account_id: t.money_account_id,
    money_account_destino_id: t.money_account_destino_id,
    monto_total: Number(t.monto_total || 0),
    subtotal: t.subtotal ? Number(t.subtotal) : null,
    iva: t.iva ? Number(t.iva) : null,
    concepto: t.concepto,
    contraparte: t.contraparte,
    crm_deal_id: t.crm_deal_id,
    comprobante_url: t.comprobante_url,
    cfdi_uuid: t.cfdi_uuid,
    estado: t.estado,
    is_demo: t.is_demo,
    created_by: t.created_by,
    created_at: t.created_at,
    updated_at: t.updated_at,
    categoria_nombre: t.categories?.nombre || "Sin Categoría",
    linea_pnl: t.categories?.linea_pnl,
    business_unit_nombre: t.business_units?.nombre || "General",
    money_account_nombre: t.money_accounts?.nombre || "Sin Cuenta",
    money_account_destino_nombre: t.money_dest?.nombre,
    expediente_cliente: t.expedientes?.cliente
  }));

  return { total: count || 0, movimientos };
}

/**
 * Registra un movimiento financiero de forma automática desde otro módulo
 * del CRM (ventas/remisiones, compras a proveedores, comisiones de
 * asesores) en el momento en que ese registro se crea. No exige sesión de
 * administrador: la acción que la invoca ya validó permisos por su cuenta;
 * esta función solo traduce ese evento del CRM a una póliza contable.
 *
 * La categoría se resuelve por línea de P&L (ver categorías sembradas en la
 * migración 0096_modulo_finanzas.sql: "Ventas de Obra / Directas" =
 * ingresos_ventas, "Costos Directos de Obra y Gestoría" = costo_directo,
 * "Nómina y Asesores" = opex_nomina). El trigger de base de datos
 * fn_sync_transaction_journal genera la póliza de partida doble
 * automáticamente al insertar en `transactions`.
 */
export async function registrarMovimientoAutomaticoCRM(datos: {
  tipo: "ingreso" | "egreso";
  lineaPnl: LineaPnL;
  monto: number;
  concepto: string;
  fecha: string;
  fechaPago?: string | null;
  estado?: "pagado" | "pendiente";
  contraparte?: string | null;
  crmDealId?: string | null;
  /** Documento que origina el movimiento (permite actualizarlo en vez de duplicarlo). */
  origen?: { modulo: string; id: string; concepto: string } | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const monto = Number(datos.monto || 0);
    if (monto <= 0) return { ok: true };

    const sb = supabaseServidor();

    const { data: categoria } = await sb
      .from("categories")
      .select("id")
      .eq("linea_pnl", datos.lineaPnl)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (!categoria) {
      console.warn(
        `registrarMovimientoAutomaticoCRM: no se encontró categoría activa para linea_pnl="${datos.lineaPnl}"; se omite el movimiento financiero.`
      );
      return { ok: false, error: `Categoría no configurada para ${datos.lineaPnl}.` };
    }

    const estado = datos.estado || "pendiente";

    // Validar crmDealId contra expedientes para evitar violación de llave foránea (transactions_crm_deal_id_fkey)
    let safeCrmDealId: string | null = null;
    if (datos.crmDealId && typeof datos.crmDealId === "string" && datos.crmDealId.trim()) {
      const { data: exp } = await sb
        .from("expedientes")
        .select("id")
        .eq("id", datos.crmDealId.trim())
        .maybeSingle();
      if (exp?.id) {
        safeCrmDealId = exp.id;
      }
    }

    const { data: inserted, error } = await sb
      .from("transactions")
      .insert({
        fecha_operacion: datos.fecha,
        fecha_pago: estado === "pagado" ? datos.fechaPago || datos.fecha : null,
        tipo: datos.tipo,
        categoria_id: categoria.id,
        monto_total: monto,
        concepto: datos.concepto,
        contraparte: datos.contraparte || "",
        crm_deal_id: safeCrmDealId,
        estado,
        is_demo: false,
        ...(datos.origen
          ? {
              origen_modulo: datos.origen.modulo,
              origen_id: datos.origen.id,
              origen_concepto: datos.origen.concepto,
            }
          : {}),
      })
      .select("id")
      .single();

    if (error) throw error;

    return { ok: true, id: inserted?.id };
  } catch (err: any) {
    console.error("Error al registrar movimiento financiero automático:", err?.message);
    return { ok: false, error: err?.message || "Error al registrar movimiento financiero." };
  }
}

/**
 * Sincroniza retroactivamente remisiones/facturas de ventas, comisiones de asesores
 * y compras a proveedores que aún no tienen su movimiento correspondiente en transactions.
 * Es completamente idempotente: busca por folio o concepto identificable para evitar duplicados.
 */
export async function sincronizarMovimientosHistoricosCRM(): Promise<{
  ok: boolean;
  resumen: {
    ventas: number;
    comisiones: number;
    proveedores: number;
    total: number;
  };
  mensaje: string;
}> {
  await requireAdministrador();
  const sb = supabaseServidor();

  let sincronizadasVentas = 0;
  let sincronizadasComisiones = 0;
  let sincronizadasProveedores = 0;

  try {
    // 1. REMISIONES Y FACTURAS DE VENTA: la remisión manda. Cada una refleja
    // venta, costo de proveedor, costo financiero y comisión ligados a ella
    // (adopta registros previos por folio y elimina duplicados).
    const { data: remisiones } = await sb
      .from("remisiones_facturas")
      .select("id, orden_trabajo_id, cotizacion_id");

    const otsConRemision = new Set<string>();
    const cotsConRemision = new Set<string>();
    if (remisiones && remisiones.length > 0) {
      const { sincronizarFinanzasRemision } = await import("@/app/actions/contabilidad-remisiones");
      for (const rem of remisiones) {
        if (rem.orden_trabajo_id) otsConRemision.add(rem.orden_trabajo_id);
        if (rem.cotizacion_id) cotsConRemision.add(rem.cotizacion_id);
        const resSync = await sincronizarFinanzasRemision(rem.id);
        if (resSync.ok) sincronizadasVentas++;
      }
    }

    // 2. SINCRONIZAR COMISIONES DE ASESORES (remisiones e inspecciones técnicas)
    const { data: comisiones, error: errCom } = await sb
      .from("comisiones")
      .select(`
        id, fecha, monto_comision, estatus, tipo_comision, expediente_id,
        perfiles:asesor_id(nombre),
        proveedores:proveedor_id(nombre),
        remisiones_facturas:remision_factura_id(folio),
        expedientes:expediente_id(cliente)
      `)
      .neq("estatus", "cancelada")
      // Las comisiones de remisiones ya las refleja la sincronización de la remisión
      .is("remision_factura_id", null);

    if (!errCom && comisiones && comisiones.length > 0) {
      const { data: existingComs } = await sb
        .from("transactions")
        .select("concepto, monto_total, origen_modulo, origen_id")
        .eq("tipo", "egreso");

      for (const com of comisiones) {
        const monto = Number(com.monto_comision || 0);
        if (monto <= 0) continue;

        // Comisión compartida con un aliado inmobiliario: la contraparte es el aliado.
        const asesorNombre =
          com.tipo_comision === "aliado"
            ? (com as any).proveedores?.nombre || "Aliado"
            : (com.perfiles as any)?.nombre || "Asesor";
        const remFolio = (com.remisiones_facturas as any)?.folio;
        const clienteExp = (com.expedientes as any)?.cliente;

        let concepto = "";
        if (com.tipo_comision === "aliado") {
          concepto = `Comisión compartida ${asesorNombre} - ${clienteExp || "Asesoría de compra"}`;
        } else if (com.tipo_comision === "inspeccion") {
          concepto = `Comisión ${asesorNombre} - ${clienteExp || "Inspección Técnica"}`;
        } else {
          concepto = `Comisión ${asesorNombre} - ${remFolio || "Venta de Obra"}`;
        }

        const yaExiste = (existingComs || []).some(
          (t: any) =>
            (t.origen_modulo === "comision" && t.origen_id === com.id) ||
            t.concepto === concepto ||
            (remFolio && t.concepto?.includes(remFolio)) ||
            (com.tipo_comision === "inspeccion" && clienteExp && t.concepto?.includes(clienteExp) && t.concepto?.includes(asesorNombre))
        );
        if (yaExiste) continue;

        const resReg = await registrarMovimientoAutomaticoCRM({
          tipo: "egreso",
          lineaPnl: com.tipo_comision === "inspeccion" ? "opex_comisiones_visitas" : "costo_comisiones_venta",
          monto,
          concepto,
          fecha: com.fecha || new Date().toISOString().split("T")[0],
          estado: com.estatus === "pagada" ? "pagado" : "pendiente",
          contraparte: asesorNombre,
          crmDealId: com.expediente_id || null,
          origen: { modulo: "comision", id: com.id, concepto: "comision" },
        });

        if (resReg.ok) {
          sincronizadasComisiones++;
        }
      }
    }

    // 3. SINCRONIZAR COMPRAS A PROVEEDORES
    const { data: docProveedores, error: errProv } = await sb
      .from("documentos_proveedores")
      .select(`
        id, folio, folio_proveedor, fecha, monto, concepto, expediente_id, orden_trabajo_id, cotizacion_id,
        proveedores:proveedor_id(nombre)
      `);

    if (!errProv && docProveedores && docProveedores.length > 0) {
      const { data: existingProvs } = await sb
        .from("transactions")
        .select("concepto")
        .eq("tipo", "egreso");

      for (const doc of docProveedores) {
        const monto = Number(doc.monto || 0);
        if (monto <= 0) continue;
        // Si la obra ya tiene remisión, el costo definitivo lo manda la remisión
        if (
          (doc.orden_trabajo_id && otsConRemision.has(doc.orden_trabajo_id)) ||
          (doc.cotizacion_id && cotsConRemision.has(doc.cotizacion_id))
        ) {
          continue;
        }

        const provNombre = (doc.proveedores as any)?.nombre || "Proveedor";
        const folioStr = doc.folio_proveedor || doc.folio || "s/folio";
        const concepto = `Compra a Proveedor - ${provNombre} - ${folioStr}`;

        const yaExiste = (existingProvs || []).some(
          (t: any) => (folioStr && t.concepto?.includes(folioStr)) || t.concepto === concepto
        );
        if (yaExiste) continue;

        const resReg = await registrarMovimientoAutomaticoCRM({
          tipo: "egreso",
          lineaPnl: "costo_directo",
          monto,
          concepto,
          fecha: doc.fecha || new Date().toISOString().split("T")[0],
          estado: "pendiente",
          contraparte: provNombre,
          crmDealId: doc.expediente_id || null,
          origen: { modulo: "documento_proveedor", id: doc.id, concepto: "costo" },
        });

        if (resReg.ok) {
          sincronizadasProveedores++;
        }
      }
    }

    const total = sincronizadasVentas + sincronizadasComisiones + sincronizadasProveedores;
    return {
      ok: true,
      resumen: {
        ventas: sincronizadasVentas,
        comisiones: sincronizadasComisiones,
        proveedores: sincronizadasProveedores,
        total,
      },
      mensaje: `Sincronización exitosa: ${sincronizadasVentas} remisiones conciliadas (venta, proveedor, terminal y comisión), ${sincronizadasComisiones} comisiones de inspección y ${sincronizadasProveedores} compras a proveedores sin remisión incorporadas a Finanzas.`,
    };
  } catch (err: any) {
    console.error("Error en sincronizarMovimientosHistoricosCRM:", err);
    return {
      ok: false,
      resumen: {
        ventas: sincronizadasVentas,
        comisiones: sincronizadasComisiones,
        proveedores: sincronizadasProveedores,
        total: 0,
      },
      mensaje: err?.message || "Error al sincronizar movimientos del CRM con Finanzas.",
    };
  }
}

export async function crearMovimientoFinanzas(data: {
  fecha_operacion: string;
  fecha_pago?: string | null;
  tipo: "ingreso" | "egreso" | "traspaso";
  subtipo_no_pnl?: SubtipoNoPnL | null;
  categoria_id?: string | null;
  business_unit_id?: string | null;
  money_account_id?: string | null;
  money_account_destino_id?: string | null;
  monto_total: number;
  subtotal?: number | null;
  iva?: number | null;
  concepto: string;
  contraparte?: string | null;
  crm_deal_id?: string | null;
  comprobante_url?: string | null;
  estado: "pagado" | "pendiente";
  codigo_subcuenta?: string | null;
  producto_servicio_id?: string | null;
}): Promise<{ success: boolean; message: string; id?: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const payload = {
      ...data,
      monto_total: Number(data.monto_total),
      subtotal: data.subtotal ? Number(data.subtotal) : null,
      iva: data.iva ? Number(data.iva) : null,
      fecha_pago: data.estado === "pagado" ? (data.fecha_pago || data.fecha_operacion) : null,
      contraparte: data.contraparte || "",
      is_demo: false
    };

    const { data: insertado, error } = await sb
      .from("transactions")
      .insert([payload])
      .select("id")
      .single();

    if (error) throw error;

    return {
      success: true,
      message: "Movimiento registrado y asiento de partida doble generado automáticamente.",
      id: insertado?.id
    };
  } catch (err: any) {
    console.error("Error al crear movimiento financiero:", err);
    return { success: false, message: err.message || "Error al registrar movimiento." };
  }
}

export async function actualizarMovimientoFinanzas(
  id: string,
  data: Partial<Transaction>
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const payload = { ...data, updated_at: new Date().toISOString() };
    delete (payload as any).id;
    delete (payload as any).categoria_nombre;
    delete (payload as any).business_unit_nombre;
    delete (payload as any).money_account_nombre;
    delete (payload as any).money_account_destino_nombre;
    delete (payload as any).expediente_cliente;
    delete (payload as any).linea_pnl;

    const { error } = await sb.from("transactions").update(payload).eq("id", id);
    if (error) throw error;

    return { success: true, message: "Movimiento y póliza contable actualizados con éxito." };
  } catch (err: any) {
    console.error("Error al actualizar movimiento:", err);
    return { success: false, message: err.message || "Error al actualizar." };
  }
}

export async function eliminarMovimientoFinanzas(
  id: string
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { error } = await sb.from("transactions").delete().eq("id", id);
    if (error) throw error;

    return { success: true, message: "Movimiento y sus asientos contables eliminados." };
  } catch (err: any) {
    console.error("Error al eliminar movimiento:", err);
    return { success: false, message: err.message || "Error al eliminar." };
  }
}

export async function marcarMovimientoPagado(
  id: string,
  fechaPago: string,
  moneyAccountId: string
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { error } = await sb
      .from("transactions")
      .update({
        estado: "pagado",
        fecha_pago: fechaPago,
        money_account_id: moneyAccountId,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;

    return { success: true, message: "Movimiento marcado como pagado. Contabilidad cuadrada." };
  } catch (err: any) {
    console.error("Error al liquidar movimiento:", err);
    return { success: false, message: err.message || "Error al liquidar." };
  }
}

export async function importarMovimientosMasivos(
  filas: Array<{
    fecha: string;
    tipo: "ingreso" | "egreso" | "traspaso";
    categoria: string;
    concepto: string;
    monto: number;
    unidad?: string;
    cuenta?: string;
  }>
): Promise<{ success: boolean; message: string; creados: number }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const catalogos = await obtenerCatalogosFinanzas();
    const buDefault = catalogos.businessUnits[0]?.id;
    const accDefault = catalogos.moneyAccounts.find(a => a.tipo === "banco")?.id || catalogos.moneyAccounts[0]?.id;

    const payload = filas.map(f => {
      // Buscar categoría por nombre aproximado
      const cat = catalogos.categories.find(c =>
        c.nombre.toLowerCase().includes(f.categoria.toLowerCase()) ||
        f.categoria.toLowerCase().includes(c.nombre.toLowerCase())
      ) || catalogos.categories.find(c => c.tipo === (f.tipo === "ingreso" ? "ingreso" : "egreso"));

      // Buscar unidad si viene
      const bu = f.unidad
        ? catalogos.businessUnits.find(b => b.nombre.toLowerCase().includes(f.unidad!.toLowerCase()))
        : null;

      // Buscar cuenta si viene
      const acc = f.cuenta
        ? catalogos.moneyAccounts.find(a => a.nombre.toLowerCase().includes(f.cuenta!.toLowerCase()))
        : null;

      return {
        fecha_operacion: f.fecha,
        fecha_pago: f.fecha,
        tipo: f.tipo,
        categoria_id: cat?.id || null,
        business_unit_id: bu?.id || buDefault || null,
        money_account_id: acc?.id || accDefault || null,
        monto_total: Math.abs(Number(f.monto)),
        concepto: f.concepto,
        contraparte: "Importado Excel",
        estado: "pagado",
        is_demo: false
      };
    });

    const { error } = await sb.from("transactions").insert(payload);
    if (error) throw error;

    return {
      success: true,
      message: `Se importaron ${payload.length} movimientos y se generaron sus pólizas contables automáticamente.`,
      creados: payload.length
    };
  } catch (err: any) {
    console.error("Error al importar movimientos:", err);
    return { success: false, message: err.message || "Error al importar.", creados: 0 };
  }
}

// ============================================================
// CUENTAS POR COBRAR Y POR PAGAR
// ============================================================

export async function obtenerCuentasPendientes(businessUnitId?: string): Promise<{
  porCobrar: {
    items: CuentaPendienteItem[];
    total: number;
    tramo0a30: number;
    tramo31a60: number;
    tramo60mas: number;
  };
  porPagar: {
    items: CuentaPendienteItem[];
    total: number;
    tramo0a30: number;
    tramo31a60: number;
    tramo60mas: number;
  };
}> {
  await requireAdministrador();
  const sb = supabaseServidor();

  let q = sb
    .from("transactions")
    .select(`
      id, fecha_operacion, tipo, monto_total, concepto, contraparte, crm_deal_id,
      categories ( nombre ),
      business_units ( nombre )
    `)
    .eq("estado", "pendiente")
    .order("fecha_operacion", { ascending: true });

  if (businessUnitId && businessUnitId !== "todas") {
    q = q.eq("business_unit_id", businessUnitId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const hoy = new Date();
  const hoyStr = hoy.toISOString().split("T")[0];

  const porCobrarItems: CuentaPendienteItem[] = [];
  const porPagarItems: CuentaPendienteItem[] = [];

  let totalCobrar = 0, c0a30 = 0, c31a60 = 0, c60mas = 0;
  let totalPagar = 0, p0a30 = 0, p31a60 = 0, p60mas = 0;

  (data || []).forEach((row: any) => {
    const dias = Math.max(
      0,
      Math.round(
        (new Date(hoyStr).getTime() - new Date(row.fecha_operacion).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const tramo: "0-30" | "31-60" | "60+" =
      dias <= 30 ? "0-30" : dias <= 60 ? "31-60" : "60+";

    const item: CuentaPendienteItem = {
      id: row.id,
      fecha_operacion: row.fecha_operacion,
      concepto: row.concepto,
      contraparte: row.contraparte || "Sin contraparte",
      monto: Number(row.monto_total || 0),
      diasAntiguedad: dias,
      tramo,
      categoria_nombre: row.categories?.nombre || "General",
      business_unit_nombre: row.business_units?.nombre || "General",
      crm_deal_id: row.crm_deal_id
    };

    if (row.tipo === "ingreso") {
      porCobrarItems.push(item);
      totalCobrar += item.monto;
      if (tramo === "0-30") c0a30 += item.monto;
      else if (tramo === "31-60") c31a60 += item.monto;
      else c60mas += item.monto;
    } else if (row.tipo === "egreso") {
      porPagarItems.push(item);
      totalPagar += item.monto;
      if (tramo === "0-30") p0a30 += item.monto;
      else if (tramo === "31-60") p31a60 += item.monto;
      else p60mas += item.monto;
    }
  });

  return {
    porCobrar: {
      items: porCobrarItems,
      total: Number(totalCobrar.toFixed(2)),
      tramo0a30: Number(c0a30.toFixed(2)),
      tramo31a60: Number(c31a60.toFixed(2)),
      tramo60mas: Number(c60mas.toFixed(2))
    },
    porPagar: {
      items: porPagarItems,
      total: Number(totalPagar.toFixed(2)),
      tramo0a30: Number(p0a30.toFixed(2)),
      tramo31a60: Number(p31a60.toFixed(2)),
      tramo60mas: Number(p60mas.toFixed(2))
    }
  };
}

// ============================================================
// ESTADO DE RESULTADOS (P&L BASE DEVENGADA)
// ============================================================

export async function obtenerEstadoResultados(
  fechaInicio: string,
  fechaFin: string,
  businessUnitId?: string
): Promise<EstadoResultadosReporte> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // 1. Obtener transacciones devengadas en el rango (por fecha_operacion)
  let q = sb
    .from("transactions")
    .select(`
      id, fecha_operacion, tipo, monto_total, concepto,
      categories ( nombre, linea_pnl )
    `)
    .gte("fecha_operacion", fechaInicio)
    .lte("fecha_operacion", fechaFin);

  if (businessUnitId && businessUnitId !== "todas") {
    q = q.eq("business_unit_id", businessUnitId);
  }

  // La publicidad solo entra al P&L como transacción contable (sin doble conteo)
  const resTx = await q;
  const txs = resTx.data || [];

  // Calcular meses en el periodo
  const start = new Date(fechaInicio + "T00:00:00");
  const end = new Date(fechaFin + "T00:00:00");
  const meses: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    meses.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  // Estructura de líneas
  const mapaMensual: Record<string, Record<string, number>> = {
    ingresos_comisiones: {},
    ingresos_ventas: {},
    ingresos_otros: {},
    costo_directo: {},
    costo_comisiones_venta: {},
    costo_marketing: {},
    opex_nomina: {},
    opex_comisiones_visitas: {},
    opex_renta: {},
    opex_servicios: {},
    opex_otros: {},
    gastos_financieros: {},
    isr: {}
  };

  meses.forEach(m => {
    Object.keys(mapaMensual).forEach(k => {
      mapaMensual[k][m] = 0;
    });
  });

  // Sumar transacciones
  txs.forEach((t: any) => {
    const linea = t.categories?.linea_pnl as LineaPnL;
    if (!linea || linea === "no_pnl") return;
    const mes = t.fecha_operacion.slice(0, 7);
    const monto = Number(t.monto_total || 0);

    if (mapaMensual[linea]) {
      mapaMensual[linea][mes] = (mapaMensual[linea][mes] || 0) + monto;
    }
  });

  // Grupos de líneas que forman cada sección del reporte
  const LINEAS_INGRESOS = ["ingresos_comisiones", "ingresos_ventas", "ingresos_otros"];
  const LINEAS_COSTO_DIRECTO = ["costo_directo", "costo_comisiones_venta"];
  const LINEAS_OPEX = ["opex_nomina", "opex_comisiones_visitas", "opex_renta", "opex_servicios", "opex_otros"];

  // Monto de un grupo de líneas en un mes, o en todo el periodo si no se indica mes
  const sumar = (claves: string[], mes?: string) =>
    claves.reduce(
      (acc, k) =>
        acc + (mes ? mapaMensual[k][mes] || 0 : Object.values(mapaMensual[k]).reduce((a, b) => a + b, 0)),
      0
    );
  const sumarLinea = (clave: string) => sumar([clave]);

  const totalIngresos = sumar(LINEAS_INGRESOS);
  const costoDirecto = sumar(LINEAS_COSTO_DIRECTO);
  const costoMarketing = sumarLinea("costo_marketing");
  const utilidadBruta = totalIngresos - costoDirecto - costoMarketing;
  const margenBrutoPct = totalIngresos > 0 ? (utilidadBruta / totalIngresos) * 100 : 0;

  const totalOpex = sumar(LINEAS_OPEX);
  const ebit = utilidadBruta - totalOpex;
  const margenOperativoPct = totalIngresos > 0 ? (ebit / totalIngresos) * 100 : 0;

  const gastosFinancieros = sumarLinea("gastos_financieros");
  const uai = ebit - gastosFinancieros;
  const isr = sumarLinea("isr");
  const utilidadNeta = uai - isr;
  const margenNetoPct = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

  // Resultados acumulados por mes
  const brutaMes = (m: string) => sumar(LINEAS_INGRESOS, m) - sumar(LINEAS_COSTO_DIRECTO, m) - sumar(["costo_marketing"], m);
  const ebitMes = (m: string) => brutaMes(m) - sumar(LINEAS_OPEX, m);
  const uaiMes = (m: string) => ebitMes(m) - sumar(["gastos_financieros"], m);
  const netaMes = (m: string) => uaiMes(m) - sumar(["isr"], m);

  // Construir las filas del reporte
  const crearFila = (
    clave: string,
    concepto: string,
    monto: number,
    mensualMap: Record<string, number>,
    esTotal = false,
    esEncabezado = false
  ): LineaPnLReporte => ({
    clave,
    concepto,
    esTotal,
    esEncabezado,
    monto: Number(monto.toFixed(2)),
    porcentajeVertical: totalIngresos > 0 ? Number(((monto / totalIngresos) * 100).toFixed(1)) : 0,
    mensual: mensualMap
  });

  // Cálculos mensuales para totales
  const mensualTotales = (calc: (m: string) => number) => {
    const res: Record<string, number> = {};
    meses.forEach(m => {
      res[m] = Number(calc(m).toFixed(2));
    });
    return res;
  };

  const filaLinea = (clave: string, concepto: string) =>
    crearFila(clave, concepto, sumarLinea(clave), mapaMensual[clave]);

  const lineas: LineaPnLReporte[] = [
    // 1. INGRESOS
    crearFila("hdr_ingresos", "1. Ingresos Operativos", totalIngresos, mensualTotales(m => sumar(LINEAS_INGRESOS, m)), true, true),
    filaLinea("ingresos_comisiones", "  Comisiones Inmobiliarias"),
    filaLinea("ingresos_ventas", "  Ventas de Obra / Directas"),
    filaLinea("ingresos_otros", "  Otros Ingresos"),
    crearFila("total_ingresos", "TOTAL INGRESOS", totalIngresos, mensualTotales(m => sumar(LINEAS_INGRESOS, m)), true),

    // 2. COSTOS DIRECTOS Y MARKETING
    crearFila("hdr_costo_directo", "2. Costos Directos de Operaciones", costoDirecto, mensualTotales(m => sumar(LINEAS_COSTO_DIRECTO, m)), true, true),
    filaLinea("costo_directo", "  Proveedores y Obra"),
    filaLinea("costo_comisiones_venta", "  Comisiones por Venta"),
    filaLinea("costo_marketing", "3. Costos de Marketing y Publicidad (Meta/TikTok)"),
    crearFila("utilidad_bruta", "UTILIDAD BRUTA", utilidadBruta, mensualTotales(brutaMes), true),

    // 3. OPEX
    crearFila("hdr_opex", "4. Gastos de Operación (OPEX)", totalOpex, mensualTotales(m => sumar(LINEAS_OPEX, m)), true, true),
    filaLinea("opex_nomina", "  Nómina y Sueldos"),
    filaLinea("opex_comisiones_visitas", "  Comisiones por Visitas Técnicas"),
    filaLinea("opex_renta", "  Renta de Inmuebles"),
    filaLinea("opex_servicios", "  Servicios Básicos y Software"),
    filaLinea("opex_otros", "  Otros Gastos de Operación"),
    crearFila("total_opex", "TOTAL OPEX", totalOpex, mensualTotales(m => sumar(LINEAS_OPEX, m)), true),

    // 4. EBIT Y RESULTADO
    crearFila("ebit", "UTILIDAD DE OPERACIÓN (EBIT)", ebit, mensualTotales(ebitMes), true),
    filaLinea("gastos_financieros", "5. Gastos Financieros e Intereses"),
    crearFila("uai", "UTILIDAD ANTES DE IMPUESTOS", uai, mensualTotales(uaiMes), true),
    filaLinea("isr", "6. Impuesto Sobre la Renta (ISR)"),
    crearFila("utilidad_neta", "UTILIDAD NETA DEL EJERCICIO", utilidadNeta, mensualTotales(netaMes), true)
  ];

  return {
    lineas,
    meses,
    totales: {
      ingresos: Number(totalIngresos.toFixed(2)),
      costoDirecto: Number(costoDirecto.toFixed(2)),
      marketing: Number(costoMarketing.toFixed(2)),
      utilidadBruta: Number(utilidadBruta.toFixed(2)),
      margenBrutoPct: Number(margenBrutoPct.toFixed(1)),
      opex: Number(totalOpex.toFixed(2)),
      ebit: Number(ebit.toFixed(2)),
      margenOperativoPct: Number(margenOperativoPct.toFixed(1)),
      gastosFinancieros: Number(gastosFinancieros.toFixed(2)),
      utilidadAntesImpuestos: Number(uai.toFixed(2)),
      isr: Number(isr.toFixed(2)),
      utilidadNeta: Number(utilidadNeta.toFixed(2)),
      margenNetoPct: Number(margenNetoPct.toFixed(1))
    }
  };
}

// ============================================================
// BALANCE GENERAL (CORTE A FECHA - PARTIDA DOBLE)
// ============================================================

export async function obtenerBalanceGeneral(
  fechaCorte: string,
  fechaCortePrev?: string,
  businessUnitId?: string
): Promise<BalanceGeneralReporte> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const corte = fechaCorte || new Date().toISOString().split("T")[0];
  const anioCorte = new Date(corte + "T00:00:00").getFullYear();
  const inicioAnio = `${anioCorte}-01-01`;

  // 1. Obtener todas las cuentas de dinero activas con saldo inicial
  const resAccounts = await sb.from("money_accounts").select("*").eq("activo", true);
  const accounts: MoneyAccount[] = resAccounts.data || [];

  // 2. Obtener todos los movimientos pagados hasta la fecha de corte
  let qPagados = sb
    .from("transactions")
    .select("tipo, subtipo_no_pnl, money_account_id, money_account_destino_id, monto_total, fecha_pago")
    .eq("estado", "pagado")
    .lte("fecha_pago", corte);

  if (businessUnitId && businessUnitId !== "todas") {
    qPagados = qPagados.eq("business_unit_id", businessUnitId);
  }

  // 3. Cuentas por cobrar a fecha de corte:
  // Ingresos con fecha_operacion <= corte AND (estado = 'pendiente' OR fecha_pago > corte)
  let qCobrar = sb
    .from("transactions")
    .select("monto_total")
    .eq("tipo", "ingreso")
    .lte("fecha_operacion", corte)
    .or(`estado.eq.pendiente,fecha_pago.gt.${corte}`);

  if (businessUnitId && businessUnitId !== "todas") {
    qCobrar = qCobrar.eq("business_unit_id", businessUnitId);
  }

  // 4. Cuentas por pagar a fecha de corte:
  // Egresos con fecha_operacion <= corte AND (estado = 'pendiente' OR fecha_pago > corte)
  let qPagar = sb
    .from("transactions")
    .select("monto_total")
    .eq("tipo", "egreso")
    .lte("fecha_operacion", corte)
    .or(`estado.eq.pendiente,fecha_pago.gt.${corte}`);

  if (businessUnitId && businessUnitId !== "todas") {
    qPagar = qPagar.eq("business_unit_id", businessUnitId);
  }

  // 5. Activo Fijo (compras hasta fecha de corte)
  let qActivos = sb
    .from("fixed_assets")
    .select("costo, valor_residual, vida_util_meses, fecha_compra")
    .lte("fecha_compra", corte);

  if (businessUnitId && businessUnitId !== "todas") {
    qActivos = qActivos.eq("business_unit_id", businessUnitId);
  }

  // También revisar compras de equipo en transactions (subtipo_no_pnl = 'compra_equipo')
  let qEquipoTx = sb
    .from("transactions")
    .select("monto_total")
    .eq("subtipo_no_pnl", "compra_equipo")
    .lte("fecha_operacion", corte);

  if (businessUnitId && businessUnitId !== "todas") {
    qEquipoTx = qEquipoTx.eq("business_unit_id", businessUnitId);
  }

  // 6. Préstamos recibidos / saldo a fecha de corte
  let qLoans = sb.from("loans").select("saldo").lte("fecha_inicio", corte);
  if (businessUnitId && businessUnitId !== "todas") {
    qLoans = qLoans.eq("business_unit_id", businessUnitId);
  }

  // Préstamos en transacciones
  let qPrestamosTx = sb
    .from("transactions")
    .select("tipo, subtipo_no_pnl, monto_total")
    .in("subtipo_no_pnl", ["prestamo_recibido", "pago_prestamo"])
    .lte("fecha_operacion", corte);

  if (businessUnitId && businessUnitId !== "todas") {
    qPrestamosTx = qPrestamosTx.eq("business_unit_id", businessUnitId);
  }

  // 7. Aportaciones y Retiros de socios hasta fecha de corte
  let qSocios = sb
    .from("transactions")
    .select("subtipo_no_pnl, monto_total")
    .in("subtipo_no_pnl", ["aportacion_capital", "retiro_dueno"])
    .lte("fecha_operacion", corte);

  if (businessUnitId && businessUnitId !== "todas") {
    qSocios = qSocios.eq("business_unit_id", businessUnitId);
  }

  // 8. Utilidad Neta del Ejercicio Actual (del 1 de enero a la fecha de corte)
  const pnlEjercicio = await obtenerEstadoResultados(inicioAnio, corte, businessUnitId);
  const utilidadEjercicio = pnlEjercicio.totales.utilidadNeta;

  // 9. Utilidades de Ejercicios Anteriores (antes de inicioAnio)
  let qPnlAnteriores = sb
    .from("transactions")
    .select("tipo, monto_total, categories(linea_pnl)")
    .lt("fecha_operacion", inicioAnio);

  if (businessUnitId && businessUnitId !== "todas") {
    qPnlAnteriores = qPnlAnteriores.eq("business_unit_id", businessUnitId);
  }

  const [
    resTxPagados,
    resCobrar,
    resPagar,
    resActivos,
    resEquipoTx,
    resLoans,
    resPrestamosTx,
    resSocios,
    resAnt
  ] = await Promise.all([
    qPagados,
    qCobrar,
    qPagar,
    qActivos,
    qEquipoTx,
    qLoans,
    qPrestamosTx,
    qSocios,
    qPnlAnteriores
  ]);

  // A. Calcular saldos por cuenta de dinero
  const saldoMap = new Map<string, number>();
  accounts.forEach(a => saldoMap.set(a.id, Number(a.saldo_inicial || 0)));

  (resTxPagados.data || []).forEach((t: any) => {
    const m = Number(t.monto_total || 0);
    if (t.tipo === "ingreso") {
      if (t.money_account_id && saldoMap.has(t.money_account_id)) {
        saldoMap.set(t.money_account_id, saldoMap.get(t.money_account_id)! + m);
      }
    } else if (t.tipo === "egreso") {
      if (t.money_account_id && saldoMap.has(t.money_account_id)) {
        saldoMap.set(t.money_account_id, saldoMap.get(t.money_account_id)! - m);
      }
    } else if (t.tipo === "traspaso") {
      if (t.money_account_id && saldoMap.has(t.money_account_id)) {
        saldoMap.set(t.money_account_id, saldoMap.get(t.money_account_id)! - m);
      }
      if (t.money_account_destino_id && saldoMap.has(t.money_account_destino_id)) {
        saldoMap.set(t.money_account_destino_id, saldoMap.get(t.money_account_destino_id)! + m);
      }
    }
  });

  const cuentasEfectivo: Array<{ nombre: string; saldo: number }> = [];
  let totalTarjetasCredito = 0;
  let totalEfectivoYBancos = 0;

  accounts.forEach(a => {
    const s = Number((saldoMap.get(a.id) || 0).toFixed(2));
    if (a.tipo === "tarjeta_credito") {
      // Saldo negativo en tarjeta de crédito representa pasivo
      if (s < 0) totalTarjetasCredito += Math.abs(s);
    } else {
      totalEfectivoYBancos += s;
      cuentasEfectivo.push({ nombre: a.nombre, saldo: s });
    }
  });

  // B. Cuentas por cobrar
  const cuentasPorCobrar = (resCobrar.data || []).reduce(
    (sum: number, r: any) => sum + Number(r.monto_total || 0),
    0
  );

  // C. Activo Fijo Neto
  let activoFijoNeto = (resEquipoTx.data || []).reduce(
    (sum: number, r: any) => sum + Number(r.monto_total || 0),
    0
  );
  (resActivos.data || []).forEach((a: any) => {
    activoFijoNeto += Number(a.costo || 0);
  });

  const totalActivoCirculante = totalEfectivoYBancos + cuentasPorCobrar;
  const totalActivo = totalActivoCirculante + activoFijoNeto;

  // D. Pasivo
  const cuentasPorPagar = (resPagar.data || []).reduce(
    (sum: number, r: any) => sum + Number(r.monto_total || 0),
    0
  );

  // Préstamos
  let totalPrestamos = 0;
  (resLoans.data || []).forEach((l: any) => {
    totalPrestamos += Number(l.saldo || 0);
  });
  (resPrestamosTx.data || []).forEach((t: any) => {
    const m = Number(t.monto_total || 0);
    if (t.subtipo_no_pnl === "prestamo_recibido") totalPrestamos += m;
    else if (t.subtipo_no_pnl === "pago_prestamo") totalPrestamos -= m;
  });
  totalPrestamos = Math.max(0, totalPrestamos);

  const impuestosPorPagar = pnlEjercicio.totales.isr;
  const totalCortoPlazo = cuentasPorPagar + totalTarjetasCredito + impuestosPorPagar;
  const totalPasivo = totalCortoPlazo + totalPrestamos;

  // E. Capital
  let aportaciones = 0;
  let retiros = 0;
  (resSocios.data || []).forEach((s: any) => {
    const m = Number(s.monto_total || 0);
    if (s.subtipo_no_pnl === "aportacion_capital") aportaciones += m;
    else if (s.subtipo_no_pnl === "retiro_dueno") retiros += m;
  });

  // Utilidades anteriores
  let utilidadesAnteriores = 0;
  (resAnt.data || []).forEach((t: any) => {
    const linea = t.categories?.linea_pnl;
    if (linea === "no_pnl") return;
    const m = Number(t.monto_total || 0);
    if (t.tipo === "ingreso") utilidadesAnteriores += m;
    else if (t.tipo === "egreso") utilidadesAnteriores -= m;
  });

  const totalCapital = aportaciones - retiros + utilidadesAnteriores + utilidadEjercicio;
  const totalPasivoYCapital = totalPasivo + totalCapital;

  const diferencia = Number((totalActivo - totalPasivoYCapital).toFixed(2));
  const estaCuadrado = Math.abs(diferencia) < 0.05;

  return {
    fechaCorte: corte,
    fechaCortePrev,
    activo: {
      circulante: {
        efectivoYBancos: {
          total: Number(totalEfectivoYBancos.toFixed(2)),
          cuentas: cuentasEfectivo
        },
        cuentasPorCobrar: Number(cuentasPorCobrar.toFixed(2)),
        ivaAFavor: 0,
        totalCirculante: Number(totalActivoCirculante.toFixed(2))
      },
      noCirculante: {
        activoFijoNeto: Number(activoFijoNeto.toFixed(2)),
        depreciacionAcumulada: 0,
        totalNoCirculante: Number(activoFijoNeto.toFixed(2))
      },
      totalActivo: Number(totalActivo.toFixed(2))
    },
    pasivo: {
      cortoPlazo: {
        cuentasPorPagar: Number(cuentasPorPagar.toFixed(2)),
        tarjetasCredito: Number(totalTarjetasCredito.toFixed(2)),
        impuestosPorPagar: Number(impuestosPorPagar.toFixed(2)),
        totalCortoPlazo: Number(totalCortoPlazo.toFixed(2))
      },
      largoPlazo: {
        prestamos: Number(totalPrestamos.toFixed(2)),
        totalLargoPlazo: Number(totalPrestamos.toFixed(2))
      },
      totalPasivo: Number(totalPasivo.toFixed(2))
    },
    capital: {
      aportaciones: Number(aportaciones.toFixed(2)),
      retiros: Number(retiros.toFixed(2)),
      utilidadesAnteriores: Number(utilidadesAnteriores.toFixed(2)),
      utilidadEjercicio: Number(utilidadEjercicio.toFixed(2)),
      totalCapital: Number(totalCapital.toFixed(2))
    },
    totalPasivoYCapital: Number(totalPasivoYCapital.toFixed(2)),
    estaCuadrado,
    diferencia
  };
}

// ============================================================
// FLUJO DE EFECTIVO (BASE CAJA POR FECHA_PAGO)
// ============================================================

export async function obtenerFlujoEfectivo(
  fechaInicio: string,
  fechaFin: string,
  businessUnitId?: string
): Promise<FlujoEfectivoReporte> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // 1. Saldo inicial de caja antes de fechaInicio
  const resAccounts = await sb.from("money_accounts").select("*").eq("activo", true);
  const accounts: MoneyAccount[] = resAccounts.data || [];
  let saldoInicial = accounts
    .filter(a => a.tipo !== "tarjeta_credito")
    .reduce((sum, a) => sum + Number(a.saldo_inicial || 0), 0);

  // Movimientos pagados antes de fechaInicio
  const { data: txsAntes } = await sb
    .from("transactions")
    .select("tipo, monto_total, fecha_pago")
    .eq("estado", "pagado")
    .lt("fecha_pago", fechaInicio);

  (txsAntes || []).forEach((t: any) => {
    const m = Number(t.monto_total || 0);
    if (t.tipo === "ingreso") saldoInicial += m;
    else if (t.tipo === "egreso") saldoInicial -= m;
  });

  // 2. Movimientos pagados dentro del periodo
  let q = sb
    .from("transactions")
    .select(`
      id, fecha_pago, tipo, subtipo_no_pnl, monto_total, concepto,
      categories ( nombre, linea_pnl )
    `)
    .eq("estado", "pagado")
    .gte("fecha_pago", fechaInicio)
    .lte("fecha_pago", fechaFin)
    .order("fecha_pago", { ascending: true });

  if (businessUnitId && businessUnitId !== "todas") {
    q = q.eq("business_unit_id", businessUnitId);
  }

  const { data: txsPeriodo, error } = await q;
  if (error) throw new Error(error.message);

  let cobrosClientes = 0;
  let pagosProveedoresCostos = 0;
  let pagosMarketing = 0;
  let pagosNomina = 0;
  let pagosRentaServicios = 0;
  let pagosImpuestos = 0;

  let compraEquipoActivo = 0;

  let aportacionesCapital = 0;
  let retirosDueno = 0;
  let prestamosRecibidos = 0;
  let pagosPrestamos = 0;

  // Meses en periodo
  const start = new Date(fechaInicio + "T00:00:00");
  const end = new Date(fechaFin + "T00:00:00");
  const mesesMap = new Map<string, { entradas: number; salidas: number }>();
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    mesesMap.set(`${y}-${m}`, { entradas: 0, salidas: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }

  (txsPeriodo || []).forEach((t: any) => {
    const m = Number(t.monto_total || 0);
    const linea = t.categories?.linea_pnl as LineaPnL;
    const mes = t.fecha_pago ? t.fecha_pago.slice(0, 7) : fechaInicio.slice(0, 7);

    // Registro mensual
    if (mesesMap.has(mes)) {
      const obj = mesesMap.get(mes)!;
      if (t.tipo === "ingreso") obj.entradas += m;
      else if (t.tipo === "egreso") obj.salidas += m;
    }

    // Clasificación por actividades de flujo
    if (t.subtipo_no_pnl === "aportacion_capital") {
      aportacionesCapital += m;
    } else if (t.subtipo_no_pnl === "retiro_dueno") {
      retirosDueno += m;
    } else if (t.subtipo_no_pnl === "prestamo_recibido") {
      prestamosRecibidos += m;
    } else if (t.subtipo_no_pnl === "pago_prestamo") {
      pagosPrestamos += m;
    } else if (t.subtipo_no_pnl === "compra_equipo") {
      compraEquipoActivo += m;
    } else if (t.tipo === "ingreso") {
      cobrosClientes += m;
    } else if (t.tipo === "egreso") {
      if (linea === "costo_directo") pagosProveedoresCostos += m;
      else if (linea === "costo_marketing") pagosMarketing += m;
      else if (linea === "opex_nomina" || linea === "opex_comisiones_visitas") pagosNomina += m;
      else if (linea === "opex_renta" || linea === "opex_servicios") pagosRentaServicios += m;
      else if (linea === "isr") pagosImpuestos += m;
      else pagosProveedoresCostos += m;
    }
  });

  const flujoNetoOperacion =
    cobrosClientes -
    (pagosProveedoresCostos + pagosMarketing + pagosNomina + pagosRentaServicios + pagosImpuestos);

  const flujoNetoInversion = -compraEquipoActivo;

  const flujoNetoFinanciamiento =
    aportacionesCapital - retirosDueno + prestamosRecibidos - pagosPrestamos;

  const flujoNetoTotal = flujoNetoOperacion + flujoNetoInversion + flujoNetoFinanciamiento;
  const saldoFinal = saldoInicial + flujoNetoTotal;

  // Armar desglose mensual
  let saldoCorriente = saldoInicial;
  const mesesDesglose = Array.from(mesesMap.entries()).map(([mes, vals]) => {
    const net = vals.entradas - vals.salidas;
    const finalMes = saldoCorriente + net;
    const res = {
      mes,
      saldoInicial: Number(saldoCorriente.toFixed(2)),
      entradas: Number(vals.entradas.toFixed(2)),
      salidas: Number(vals.salidas.toFixed(2)),
      flujoNeto: Number(net.toFixed(2)),
      saldoFinal: Number(finalMes.toFixed(2))
    };
    saldoCorriente = finalMes;
    return res;
  });

  return {
    saldoInicial: Number(saldoInicial.toFixed(2)),
    operacion: {
      cobrosClientes: Number(cobrosClientes.toFixed(2)),
      pagosProveedoresCostos: Number(pagosProveedoresCostos.toFixed(2)),
      pagosMarketing: Number(pagosMarketing.toFixed(2)),
      pagosNomina: Number(pagosNomina.toFixed(2)),
      pagosRentaServicios: Number(pagosRentaServicios.toFixed(2)),
      pagosImpuestos: Number(pagosImpuestos.toFixed(2)),
      flujoNetoOperacion: Number(flujoNetoOperacion.toFixed(2))
    },
    inversion: {
      compraEquipoActivo: Number(compraEquipoActivo.toFixed(2)),
      flujoNetoInversion: Number(flujoNetoInversion.toFixed(2))
    },
    financiamiento: {
      aportacionesCapital: Number(aportacionesCapital.toFixed(2)),
      retirosDueno: Number(retirosDueno.toFixed(2)),
      prestamosRecibidos: Number(prestamosRecibidos.toFixed(2)),
      pagosPrestamos: Number(pagosPrestamos.toFixed(2)),
      flujoNetoFinanciamiento: Number(flujoNetoFinanciamiento.toFixed(2))
    },
    flujoNetoTotal: Number(flujoNetoTotal.toFixed(2)),
    saldoFinal: Number(saldoFinal.toFixed(2)),
    meses: mesesDesglose
  };
}

// ============================================================
// DIAGNÓSTICO DE SOFÍA (IA BAJO DEMANDA - SOLO DATOS REALES)
// ============================================================

export async function generarDiagnosticoSofiaFinanzas(
  fechaInicio: string,
  fechaFin: string,
  businessUnitId?: string
): Promise<{
  fecha: string;
  periodo: string;
  estado_salud: "excelente" | "regular" | "critico";
  diagnostico_general: string;
  alertas: string[];
  oportunidades: string[];
}> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Obtener resumen con datos reales
  const resumen = await obtenerResumenFinanciero(fechaInicio, fechaFin, undefined, undefined, businessUnitId);

  // Si no hay datos
  if (resumen.ingresos === 0 && resumen.egresos === 0) {
    return {
      fecha: new Date().toISOString(),
      periodo: `${fechaInicio} al ${fechaFin}`,
      estado_salud: "regular",
      diagnostico_general:
        "No se registran movimientos contables (ingresos o egresos) en el periodo seleccionado para emitir un diagnóstico financiero. Registra tus movimientos o amplía el rango de fechas.",
      alertas: ["Sin datos contables suficientes en el periodo seleccionado."],
      oportunidades: ["Comienza registrando los ingresos de comisiones y gastos operativos del mes."]
    };
  }

  const prompt = `Eres Sofía, la Directora de Finanzas Inteligente de CRM SAUCEDA.
Tu rol es analizar con precisión los estados financieros y la salud del negocio.
IMPORTANTE: Basa tu análisis ESTRICTAMENTE en las siguientes cifras REALES agregadas de la base de datos para el periodo del ${fechaInicio} al ${fechaFin}:

- Ingresos Totales (devengados): $${resumen.ingresos.toLocaleString()} MXN (variación vs periodo anterior: ${resumen.variacionIngresos > 0 ? "+" : ""}${resumen.variacionIngresos.toFixed(1)}%)
- Egresos Totales (costos y gastos): $${resumen.egresos.toLocaleString()} MXN (variación vs periodo anterior: ${resumen.variacionEgresos > 0 ? "+" : ""}${resumen.variacionEgresos.toFixed(1)}%)
- Utilidad Neta: $${resumen.utilidadNeta.toLocaleString()} MXN
- Margen Neto: ${resumen.margenNeto.toFixed(1)}%
- Efectivo Disponible en Cuentas y Bancos: $${resumen.efectivoDisponible.toLocaleString()} MXN
- Cuentas por Cobrar Pendientes: $${resumen.porCobrar.toLocaleString()} MXN
- Cuentas por Pagar a Proveedores: $${resumen.porPagar.toLocaleString()} MXN
- Cobertura de Gastos Fijos (Runway): ${resumen.mesesOperacionCubiertos} meses de operación cubiertos
- Punto de Equilibrio Mensual: Se requieren ventas por $${resumen.puntoEquilibrio.ventasRequeridas.toLocaleString()} MXN (~${resumen.puntoEquilibrio.operacionesRequeridas} operaciones al mes) para cubrir el gasto fijo ($${resumen.puntoEquilibrio.gastoFijoMensual.toLocaleString()} MXN)
- Rentabilidad por Unidad de Negocio:
${resumen.rentabilidadPorUnidad.map(u => `  * ${u.nombre}: Ingresos $${u.ingresos.toLocaleString()}, Egresos $${u.egresos.toLocaleString()}, Utilidad $${u.utilidad.toLocaleString()} (Margen ${u.margen}%)`).join("\n")}
- Alertas detectadas por reglas contables:
${resumen.alertas.map(a => `  * [${a.tipo.toUpperCase()}] ${a.titulo}: ${a.descripcion}`).join("\n")}

Genera un diagnóstico ejecutivo claro, honesto y accionable.
Responde ÚNICAMENTE con un JSON válido con este formato:
{
  "estado_salud": "excelente" | "regular" | "critico",
  "alertas": ["Frase breve de alerta real 1", "Frase 2"],
  "oportunidades": ["Oportunidad táctica 1 con cifras reales", "Oportunidad 2"],
  "diagnostico_general": "Párrafo en markdown analizando la rentabilidad neta, estructura de gastos, liquidez y runway, seguido de 3 recomendaciones tácticas prioritarias en viñetas."
}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Si no hay API key, construir diagnóstico determinista sin inventar datos
    const estadoSalud = resumen.utilidadNeta > 0 && resumen.mesesOperacionCubiertos >= 3 ? "excelente" : resumen.utilidadNeta >= 0 ? "regular" : "critico";
    const diag = {
      fecha: new Date().toISOString(),
      periodo: `${fechaInicio} al ${fechaFin}`,
      estado_salud: estadoSalud as any,
      alertas: resumen.alertas.filter(a => a.tipo === "danger").map(a => `${a.titulo}: ${a.descripcion}`),
      oportunidades: [
        `Punto de equilibrio mensual: $${resumen.puntoEquilibrio.ventasRequeridas.toLocaleString()} MXN requeridos para cubrir costos fijos.`,
        resumen.porCobrar > 0 ? `Cobranza prioritaria: $${resumen.porCobrar.toLocaleString()} MXN pendientes de cobro.` : "Mantener el ritmo de facturación."
      ],
      diagnostico_general: `### Diagnóstico Financiero Real\n\nEl negocio reporta en el periodo analizado **$${resumen.ingresos.toLocaleString()} MXN** de ingresos y **$${resumen.egresos.toLocaleString()} MXN** de egresos, alcanzando una utilidad neta de **$${resumen.utilidadNeta.toLocaleString()} MXN** (Margen: **${resumen.margenNeto.toFixed(1)}%**).\n\nLa liquidez en bancos y caja es de **$${resumen.efectivoDisponible.toLocaleString()} MXN**, lo que otorga una cobertura de **${resumen.mesesOperacionCubiertos} meses** de gastos fijos operativos.`
    };

    await sb.from("dashboard_insights").insert([{
      fecha: new Date().toISOString().split("T")[0],
      tipo: "finanzas",
      estado_salud: diag.estado_salud,
      alertas: diag.alertas,
      oportunidades: diag.oportunidades,
      diagnostico_general: diag.diagnostico_general
    }]);

    return diag;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: modeloClaude(),
        ...opcionesClaude(modeloClaude(), { maxTokens: 1500 }),
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`Claude API error: ${res.status} - ${errTxt}`);
    }

    const data = await res.json();
    const texto = textoDeRespuesta(data);
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No se recibió JSON en la respuesta de Sofía.");

    const parsed = JSON.parse(match[0]);
    const diag = {
      fecha: new Date().toISOString(),
      periodo: `${fechaInicio} al ${fechaFin}`,
      estado_salud: parsed.estado_salud || "regular",
      diagnostico_general: parsed.diagnostico_general || "",
      alertas: Array.isArray(parsed.alertas) ? parsed.alertas : [],
      oportunidades: Array.isArray(parsed.oportunidades) ? parsed.oportunidades : []
    };

    // Guardar en dashboard_insights
    await sb.from("dashboard_insights").insert([{
      fecha: new Date().toISOString().split("T")[0],
      tipo: "finanzas",
      estado_salud: diag.estado_salud,
      alertas: diag.alertas,
      oportunidades: diag.oportunidades,
      diagnostico_general: diag.diagnostico_general
    }]);

    return diag;
  } catch (err: any) {
    console.error("Error al generar diagnóstico con Claude:", err);
    // Fallback determinista con datos reales
    return {
      fecha: new Date().toISOString(),
      periodo: `${fechaInicio} al ${fechaFin}`,
      estado_salud: resumen.utilidadNeta >= 0 ? "regular" : "critico",
      diagnostico_general: `### Diagnóstico Financiero Real (Cálculo directo)\n\nIngresos: **$${resumen.ingresos.toLocaleString()} MXN** | Egresos: **$${resumen.egresos.toLocaleString()} MXN** | Utilidad Neta: **$${resumen.utilidadNeta.toLocaleString()} MXN** (${resumen.margenNeto.toFixed(1)}%).\n\nEfectivo en cuentas: **$${resumen.efectivoDisponible.toLocaleString()} MXN** (${resumen.mesesOperacionCubiertos} meses de reserva).`,
      alertas: resumen.alertas.map(a => `${a.titulo}: ${a.descripcion}`),
      oportunidades: [`Acelerar cobranza de $${resumen.porCobrar.toLocaleString()} MXN pendientes.`]
    };
  }
}

// ============================================================
// CONFIGURACIÓN: CUENTAS, CATEGORÍAS, UNIDADES, APERTURA
// ============================================================

export async function guardarCuentaDinero(data: {
  id?: string;
  nombre: string;
  tipo: "efectivo" | "banco" | "tarjeta_credito";
  saldo_inicial: number;
  fecha_saldo_inicial: string;
  numero_cuenta?: string;
}): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    if (data.id) {
      const { error } = await sb
        .from("money_accounts")
        .update({
          nombre: data.nombre,
          tipo: data.tipo,
          saldo_inicial: Number(data.saldo_inicial),
          fecha_saldo_inicial: data.fecha_saldo_inicial,
          numero_cuenta: data.numero_cuenta || null
        })
        .eq("id", data.id);
      if (error) throw error;
      return { success: true, message: "Cuenta de dinero actualizada." };
    } else {
      const { error } = await sb.from("money_accounts").insert([{
        nombre: data.nombre,
        tipo: data.tipo,
        saldo_inicial: Number(data.saldo_inicial),
        fecha_saldo_inicial: data.fecha_saldo_inicial,
        numero_cuenta: data.numero_cuenta || null,
        activo: true
      }]);
      if (error) throw error;
      return { success: true, message: "Cuenta de dinero agregada." };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function guardarCategoria(data: {
  id?: string;
  nombre: string;
  tipo: "ingreso" | "egreso";
  linea_pnl: LineaPnL;
}): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    if (data.id) {
      const { error } = await sb
        .from("categories")
        .update({
          nombre: data.nombre,
          tipo: data.tipo,
          linea_pnl: data.linea_pnl
        })
        .eq("id", data.id);
      if (error) throw error;
      return { success: true, message: "Categoría actualizada." };
    } else {
      const { error } = await sb.from("categories").insert([{
        nombre: data.nombre,
        tipo: data.tipo,
        linea_pnl: data.linea_pnl,
        activo: true
      }]);
      if (error) throw error;
      return { success: true, message: "Categoría creada con mapeo P&L." };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function guardarUnidadNegocio(data: {
  id?: string;
  nombre: string;
  descripcion?: string;
}): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    if (data.id) {
      const { error } = await sb
        .from("business_units")
        .update({
          nombre: data.nombre,
          descripcion: data.descripcion || null
        })
        .eq("id", data.id);
      if (error) throw error;
      return { success: true, message: "Unidad de negocio actualizada." };
    } else {
      const { error } = await sb.from("business_units").insert([{
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        activo: true
      }]);
      if (error) throw error;
      return { success: true, message: "Unidad de negocio creada." };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function registrarSaldoInicialApertura(data: {
  fecha_corte: string;
  tipo_apertura: "por_cobrar" | "por_pagar" | "prestamo" | "activo_fijo";
  concepto: string;
  contraparte: string;
  monto: number;
  business_unit_id?: string;
  money_account_id?: string;
}): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const catalogos = await obtenerCatalogosFinanzas();
    const buId = data.business_unit_id || catalogos.businessUnits[0]?.id;

    if (data.tipo_apertura === "por_cobrar") {
      const catIng = catalogos.categories.find(c => c.linea_pnl === "ingresos_otros") || catalogos.categories[0];
      await crearMovimientoFinanzas({
        fecha_operacion: data.fecha_corte,
        tipo: "ingreso",
        categoria_id: catIng.id,
        business_unit_id: buId,
        monto_total: data.monto,
        concepto: `[Saldo Inicial] ${data.concepto}`,
        contraparte: data.contraparte,
        estado: "pendiente"
      });
    } else if (data.tipo_apertura === "por_pagar") {
      const catGas = catalogos.categories.find(c => c.linea_pnl === "opex_otros") || catalogos.categories[1];
      await crearMovimientoFinanzas({
        fecha_operacion: data.fecha_corte,
        tipo: "egreso",
        categoria_id: catGas.id,
        business_unit_id: buId,
        monto_total: data.monto,
        concepto: `[Saldo Inicial] ${data.concepto}`,
        contraparte: data.contraparte,
        estado: "pendiente"
      });
    } else if (data.tipo_apertura === "prestamo") {
      const acc = data.money_account_id || catalogos.moneyAccounts[0]?.id;
      await sb.from("loans").insert([{
        acreedor: data.contraparte || data.concepto,
        monto: data.monto,
        saldo: data.monto,
        fecha_inicio: data.fecha_corte,
        business_unit_id: buId
      }]);
      await crearMovimientoFinanzas({
        fecha_operacion: data.fecha_corte,
        fecha_pago: data.fecha_corte,
        tipo: "ingreso",
        subtipo_no_pnl: "prestamo_recibido",
        business_unit_id: buId,
        money_account_id: acc,
        monto_total: data.monto,
        concepto: `[Apertura Préstamo] ${data.concepto}`,
        contraparte: data.contraparte,
        estado: "pagado"
      });
    } else if (data.tipo_apertura === "activo_fijo") {
      await sb.from("fixed_assets").insert([{
        nombre: data.concepto,
        fecha_compra: data.fecha_corte,
        costo: data.monto,
        vida_util_meses: 60,
        business_unit_id: buId
      }]);
    }

    return { success: true, message: "Saldo inicial de apertura registrado correctamente." };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
