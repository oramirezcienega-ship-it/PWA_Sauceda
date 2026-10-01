"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";

/**
 * Rentabilidad comercial por Centro de Costos → Subcuenta (especialidad) → Producto.
 *
 *   Margen neto = Venta − Costo directo − Terminal − Comisiones − Publicidad directa − Prorrateo pub. general
 *   CAC         = Publicidad ÷ Ventas cerradas (remisiones; en Inmobiliaria, expedientes cerrados)
 *   ROAS        = Venta ÷ Publicidad
 *
 * Ventas y costos salen del centro de costos de cada remisión; la publicidad, de
 * los movimientos contables de marketing (transactions), nunca de las tablas de campañas.
 * Reparto de publicidad sin subcuenta específica:
 *   - Corporativo / subcuentas institucionales → entre todas las especialidades según su venta.
 *   - Centro de costos sin subcuenta            → entre las especialidades de ese centro según su venta.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface MetricasRentabilidad {
  ingreso: number;
  costoDirecto: number;
  terminal: number;
  comision: number;
  publicidadDirecta: number;
  publicidadProrrateada: number;
  publicidadTotal: number;
  costoTotal: number;
  margenNeto: number;
  /** Margen neto / ingreso (%) */
  margenPct: number;
  /** Margen neto / costo total (%) */
  roi: number;
  /** Ingreso / publicidad (veces); null si no hubo publicidad */
  roas: number | null;
  /** Publicidad / ventas cerradas; null si no hubo ventas */
  cac: number | null;
  ventas: number;
}

export interface LineaSubcuenta extends MetricasRentabilidad {
  clave: string;
  codigoSubcuenta: string | null;
  nombre: string;
  cuentaMayor: string;
}

export interface CentroRentabilidad extends MetricasRentabilidad {
  businessUnitId: string | null;
  codigo: string | null;
  nombre: string;
  /** Unidad con que se cuentan las ventas para el CAC */
  unidadVentas: "remisiones" | "expedientes cerrados";
  subcuentas: LineaSubcuenta[];
}

export interface LineaProducto extends MetricasRentabilidad {
  clave: string;
  productoId: string | null;
  productoNombre: string;
  codigoSubcuenta: string | null;
  nombreSubcuenta: string;
  centroNombre: string;
  unidad: string;
  cantidad: number;
  precioPromedioUnidad: number | null;
  costoDirectoPromedioUnidad: number | null;
}

export interface ReporteRentabilidadComercial {
  centros: CentroRentabilidad[];
  productos: LineaProducto[];
  totales: MetricasRentabilidad;
  /** Publicidad institucional que no se pudo prorratear por falta de ventas en el periodo */
  publicidadSinProrratear: number;
}

type Acum = {
  ingreso: number;
  costoDirecto: number;
  terminal: number;
  comision: number;
  publicidadDirecta: number;
  publicidadProrrateada: number;
  remisiones: Set<string>;
};

const nuevoAcum = (): Acum => ({
  ingreso: 0,
  costoDirecto: 0,
  terminal: 0,
  comision: 0,
  publicidadDirecta: 0,
  publicidadProrrateada: 0,
  remisiones: new Set<string>(),
});

function metricas(a: Omit<Acum, "remisiones">, ventas: number): MetricasRentabilidad {
  const publicidadTotal = a.publicidadDirecta + a.publicidadProrrateada;
  const costoTotal = a.costoDirecto + a.terminal + a.comision + publicidadTotal;
  const margenNeto = a.ingreso - costoTotal;
  return {
    ingreso: r2(a.ingreso),
    costoDirecto: r2(a.costoDirecto),
    terminal: r2(a.terminal),
    comision: r2(a.comision),
    publicidadDirecta: r2(a.publicidadDirecta),
    publicidadProrrateada: r2(a.publicidadProrrateada),
    publicidadTotal: r2(publicidadTotal),
    costoTotal: r2(costoTotal),
    margenNeto: r2(margenNeto),
    margenPct: a.ingreso > 0 ? r2((margenNeto / a.ingreso) * 100) : 0,
    roi: costoTotal > 0 ? r2((margenNeto / costoTotal) * 100) : 0,
    roas: publicidadTotal > 0 ? r2(a.ingreso / publicidadTotal) : null,
    cac: ventas > 0 && publicidadTotal > 0 ? r2(publicidadTotal / ventas) : null,
    ventas,
  };
}

/** Reparte `monto` entre los destinos según su peso (ingreso). Devuelve false si no hay a quién. */
function prorratear<T>(monto: number, destinos: T[], peso: (d: T) => number, asignar: (d: T, v: number) => void) {
  const suma = destinos.reduce((acc, d) => acc + Math.max(0, peso(d)), 0);
  if (monto <= 0 || suma <= 0) return false;
  destinos.forEach((d) => asignar(d, (monto * Math.max(0, peso(d))) / suma));
  return true;
}

export async function obtenerRentabilidadComercial(
  fechaInicio?: string,
  fechaFin?: string
): Promise<ReporteRentabilidadComercial> {
  await requireAdmin();
  const sb = supabaseServidor();

  let qRent = sb
    .from("remisiones_rentabilidad_productos")
    .select("remision_factura_id, producto_servicio_id, producto_nombre, cantidad, unidad, ingreso, costo_proveedor, costo_financiero, comision, codigo_subcuenta, business_unit_id");
  let qMkt = sb
    .from("transactions")
    .select("monto_total, business_unit_id, codigo_subcuenta, producto_servicio_id, categories!inner(linea_pnl)")
    .eq("categories.linea_pnl", "costo_marketing");
  let qIngInmob = sb
    .from("transactions")
    .select("monto_total, business_unit_id, origen_modulo, categories!inner(linea_pnl)")
    .eq("tipo", "ingreso")
    .in("categories.linea_pnl", ["ingresos_comisiones", "ingresos_ventas", "ingresos_otros"]);
  let qCierres = sb.from("expedientes").select("id, ultimo_movimiento").eq("etapa", "cerrado");

  if (fechaInicio) {
    qRent = qRent.gte("fecha", fechaInicio);
    qMkt = qMkt.gte("fecha_operacion", fechaInicio);
    qIngInmob = qIngInmob.gte("fecha_operacion", fechaInicio);
    qCierres = qCierres.gte("ultimo_movimiento", fechaInicio);
  }
  if (fechaFin) {
    qRent = qRent.lte("fecha", fechaFin);
    qMkt = qMkt.lte("fecha_operacion", fechaFin);
    qIngInmob = qIngInmob.lte("fecha_operacion", fechaFin);
    qCierres = qCierres.lte("ultimo_movimiento", fechaFin);
  }

  const [resRent, resMkt, resIng, resCierres, resSub, resCc] = await Promise.all([
    qRent,
    qMkt,
    qIngInmob,
    qCierres,
    sb.from("marketing_subcuentas").select("codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id, es_general, orden"),
    sb.from("business_units").select("id, nombre, codigo, activo"),
  ]);
  if (resRent.error) throw new Error(resRent.error.message);
  if (resMkt.error) throw new Error(resMkt.error.message);

  const subcuentas = resSub.data || [];
  const subPorCodigo = new Map<string, any>(subcuentas.map((s: any) => [s.codigo, s]));
  const centros = resCc.data || [];
  const ccPorId = new Map<string, any>(centros.map((c: any) => [c.id, c]));
  const ccCorporativo = centros.find((c: any) => c.codigo === "CC-CORPORATIVO")?.id || null;
  const ccInmobiliaria = centros.find((c: any) => c.codigo === "CC-INMOBILIARIA")?.id || null;

  // ---- Líneas por subcuenta (clave = subcuenta, o "BU:<id>" si no tiene) ----
  const lineas = new Map<string, Acum & { codigo: string | null; centroId: string | null }>();
  const linea = (codigo: string | null, centroId: string | null) => {
    const clave = codigo || `BU:${centroId || "sin"}`;
    let l = lineas.get(clave);
    if (!l) {
      l = { ...nuevoAcum(), codigo, centroId: codigo ? subPorCodigo.get(codigo)?.business_unit_id || centroId : centroId };
      lineas.set(clave, l);
    }
    return l;
  };

  // Productos (para la vista de producto)
  type AcumProd = Acum & {
    productoId: string | null;
    nombre: string;
    unidad: string;
    cantidad: number;
    codigo: string | null;
    centroId: string | null;
  };
  const productos = new Map<string, AcumProd>();

  for (const f of resRent.data || []) {
    const ingreso = Number(f.ingreso || 0);
    const l = linea(f.codigo_subcuenta || null, f.business_unit_id || null);
    l.ingreso += ingreso;
    l.costoDirecto += Number(f.costo_proveedor || 0);
    l.terminal += Number(f.costo_financiero || 0);
    l.comision += Number(f.comision || 0);
    l.remisiones.add(f.remision_factura_id);

    const claveProd = `${f.producto_servicio_id || `nombre:${(f.producto_nombre || "").toLowerCase()}`}|${f.codigo_subcuenta || ""}`;
    const p =
      productos.get(claveProd) ||
      ({
        ...nuevoAcum(),
        productoId: f.producto_servicio_id || null,
        nombre: f.producto_nombre || "Sin nombre",
        unidad: f.unidad || "m2",
        cantidad: 0,
        codigo: f.codigo_subcuenta || null,
        centroId: l.centroId,
      } as AcumProd);
    p.ingreso += ingreso;
    p.costoDirecto += Number(f.costo_proveedor || 0);
    p.terminal += Number(f.costo_financiero || 0);
    p.comision += Number(f.comision || 0);
    p.cantidad += Number(f.cantidad || 0);
    p.remisiones.add(f.remision_factura_id);
    productos.set(claveProd, p);
  }

  // ---- Publicidad (solo movimientos contables) ----
  let poolGlobal = 0;
  const poolPorCentro = new Map<string, number>();
  // Publicidad dirigida a un producto específico (se asigna directo en la vista de producto)
  const directaPorProducto = new Map<string, number>();

  for (const t of resMkt.data || []) {
    const monto = Number(t.monto_total || 0);
    if (monto <= 0) continue;
    const sub = t.codigo_subcuenta ? subPorCodigo.get(t.codigo_subcuenta) : null;
    const centroId = t.business_unit_id || sub?.business_unit_id || null;

    if (sub && !sub.es_general) {
      linea(sub.codigo, centroId).publicidadDirecta += monto;
      if (t.producto_servicio_id) {
        const k = `${t.producto_servicio_id}|${sub.codigo}`;
        directaPorProducto.set(k, (directaPorProducto.get(k) || 0) + monto);
      }
    } else if ((sub && sub.es_general) || !centroId || centroId === ccCorporativo) {
      poolGlobal += monto;
    } else {
      poolPorCentro.set(centroId, (poolPorCentro.get(centroId) || 0) + monto);
    }
  }

  const todasLineas = () => Array.from(lineas.values());

  // Centro sin subcuenta → entre las especialidades de ese centro según su venta
  poolPorCentro.forEach((monto, centroId) => {
    const destinos = todasLineas().filter((l) => l.centroId === centroId && l.ingreso > 0);
    const ok = prorratear(monto, destinos, (l) => l.ingreso, (l, v) => (l.publicidadProrrateada += v));
    if (!ok) linea(null, centroId).publicidadDirecta += monto;
  });

  // Institucional → entre todas las especialidades según su venta
  let publicidadSinProrratear = 0;
  if (poolGlobal > 0) {
    const destinos = todasLineas().filter((l) => l.ingreso > 0);
    const ok = prorratear(poolGlobal, destinos, (l) => l.ingreso, (l, v) => (l.publicidadProrrateada += v));
    if (!ok) {
      publicidadSinProrratear = poolGlobal;
      linea(null, ccCorporativo).publicidadDirecta += poolGlobal;
    }
  }

  // ---- Publicidad de cada especialidad hacia sus productos ----
  const productosLista = Array.from(productos.entries());
  lineas.forEach((l, clave) => {
    const prods = productosLista.filter(([, p]) => (p.codigo || `BU:${p.centroId || "sin"}`) === clave).map(([k, p]) => ({ k, p }));
    let directaAsignada = 0;
    prods.forEach(({ p }) => {
      if (!p.productoId) return;
      const d = directaPorProducto.get(`${p.productoId}|${p.codigo}`) || 0;
      p.publicidadDirecta += d;
      directaAsignada += d;
    });
    const restanteDirecta = Math.max(0, l.publicidadDirecta - directaAsignada);
    prorratear(restanteDirecta, prods, ({ p }) => p.ingreso, ({ p }, v) => (p.publicidadDirecta += v));
    prorratear(l.publicidadProrrateada, prods, ({ p }) => p.ingreso, ({ p }, v) => (p.publicidadProrrateada += v));
  });

  // ---- Ingresos y cierres de Inmobiliaria (sin remisiones) ----
  let ingresoInmobiliario = 0;
  for (const t of resIng.data || []) {
    if (t.origen_modulo === "remision") continue;
    if (ccInmobiliaria && t.business_unit_id === ccInmobiliaria) ingresoInmobiliario += Number(t.monto_total || 0);
  }
  const cierresInmobiliarios = (resCierres.data || []).length;

  // ---- Armar centros ----
  const porCentro = new Map<string, CentroRentabilidad & { _acum: Acum }>();
  const nombreSubcuenta = (codigo: string | null) => (codigo ? subPorCodigo.get(codigo)?.nombre || codigo : "Sin subcuenta");

  Array.from(lineas.entries()).forEach(([clave, l]) => {
    const centroId = l.centroId;
    const keyCentro = centroId || "sin";
    const cc = centroId ? ccPorId.get(centroId) : null;
    const esInmob = centroId !== null && centroId === ccInmobiliaria;
    let c = porCentro.get(keyCentro);
    if (!c) {
      c = {
        ...metricas(nuevoAcum(), 0),
        businessUnitId: centroId,
        codigo: cc?.codigo || null,
        nombre: cc?.nombre || "Sin centro de costos",
        unidadVentas: esInmob ? "expedientes cerrados" : "remisiones",
        subcuentas: [],
        _acum: nuevoAcum(),
      };
      porCentro.set(keyCentro, c);
    }
    const sub = l.codigo ? subPorCodigo.get(l.codigo) : null;
    c.subcuentas.push({
      clave,
      codigoSubcuenta: l.codigo,
      nombre: l.codigo ? nombreSubcuenta(l.codigo) : "Sin subcuenta / general del centro",
      cuentaMayor: sub ? `${sub.cuenta_mayor_codigo} ${sub.cuenta_mayor_nombre}` : "",
      ...metricas(l, esInmob ? 0 : l.remisiones.size),
    });
    const a = c._acum;
    a.ingreso += l.ingreso;
    a.costoDirecto += l.costoDirecto;
    a.terminal += l.terminal;
    a.comision += l.comision;
    a.publicidadDirecta += l.publicidadDirecta;
    a.publicidadProrrateada += l.publicidadProrrateada;
    l.remisiones.forEach((r) => a.remisiones.add(r));
  });

  // Inmobiliaria: aunque no tenga publicidad, mostrar su ingreso y cierres
  if (ccInmobiliaria && (ingresoInmobiliario > 0 || cierresInmobiliarios > 0) && !porCentro.has(ccInmobiliaria)) {
    const cc = ccPorId.get(ccInmobiliaria);
    porCentro.set(ccInmobiliaria, {
      ...metricas(nuevoAcum(), 0),
      businessUnitId: ccInmobiliaria,
      codigo: cc?.codigo || null,
      nombre: cc?.nombre || "Inmobiliaria",
      unidadVentas: "expedientes cerrados",
      subcuentas: [],
      _acum: nuevoAcum(),
    });
  }

  const ordenSub = (codigo: string | null) => (codigo ? subPorCodigo.get(codigo)?.orden ?? 99 : 100);
  const centrosLista: CentroRentabilidad[] = Array.from(porCentro.values())
    .map(({ _acum, ...c }) => {
      const esInmob = c.businessUnitId === ccInmobiliaria;
      if (esInmob) _acum.ingreso += ingresoInmobiliario;
      const ventas = esInmob ? cierresInmobiliarios : _acum.remisiones.size;
      return {
        ...c,
        ...metricas(_acum, ventas),
        subcuentas: c.subcuentas.sort((a, b) => ordenSub(a.codigoSubcuenta) - ordenSub(b.codigoSubcuenta)),
      };
    })
    .sort((a, b) => b.ingreso - a.ingreso);

  const productosResultado: LineaProducto[] = Array.from(productos.entries())
    .map(([clave, p]) => {
      const m = metricas(p, p.remisiones.size);
      return {
        clave,
        productoId: p.productoId,
        productoNombre: p.nombre,
        codigoSubcuenta: p.codigo,
        nombreSubcuenta: nombreSubcuenta(p.codigo),
        centroNombre: p.centroId ? ccPorId.get(p.centroId)?.nombre || "" : "",
        unidad: p.unidad,
        cantidad: r2(p.cantidad),
        precioPromedioUnidad: p.cantidad > 0 ? r2(p.ingreso / p.cantidad) : null,
        costoDirectoPromedioUnidad: p.cantidad > 0 ? r2(p.costoDirecto / p.cantidad) : null,
        ...m,
      };
    })
    .sort((a, b) => b.margenNeto - a.margenNeto);

  // Totales
  const tot = nuevoAcum();
  let ventasTot = 0;
  centrosLista.forEach((c) => {
    tot.ingreso += c.ingreso;
    tot.costoDirecto += c.costoDirecto;
    tot.terminal += c.terminal;
    tot.comision += c.comision;
    tot.publicidadDirecta += c.publicidadDirecta;
    tot.publicidadProrrateada += c.publicidadProrrateada;
    ventasTot += c.ventas;
  });

  return {
    centros: centrosLista,
    productos: productosResultado,
    totales: metricas(tot, ventasTot),
    publicidadSinProrratear: r2(publicidadSinProrratear),
  };
}
