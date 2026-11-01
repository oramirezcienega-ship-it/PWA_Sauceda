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
  /** Utilidad bruta (ingreso - costo directo - terminal - comisión) / publicidad; ganancia para Sauceda por peso de pauta */
  poas: number | null;
  /** Publicidad / ventas cerradas; null si no hubo ventas */
  cac: number | null;
  ventas: number;
  /** Leads captados en el periodo */
  leads: number;
  /** Costo por Lead (publicidad / leads); null si no hubo leads o publicidad */
  cpl: number | null;
  /** Cotizaciones registradas en pipeline */
  cotizacionesCount: number;
  /** Monto total cotizado en pipeline ($) */
  montoCotizado: number;
  /** Utilidad bruta potencial de cotizaciones en pipeline ($) */
  utilidadPotencial: number;
  /** POAS Proyectado: (utilidad bruta real + utilidad bruta potencial cotizada) / publicidad */
  poasProyectado: number | null;
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
  leads: number;
  cotizacionesCount: number;
  montoCotizado: number;
  utilidadPotencial: number;
};

const nuevoAcum = (): Acum => ({
  ingreso: 0,
  costoDirecto: 0,
  terminal: 0,
  comision: 0,
  publicidadDirecta: 0,
  publicidadProrrateada: 0,
  remisiones: new Set<string>(),
  leads: 0,
  cotizacionesCount: 0,
  montoCotizado: 0,
  utilidadPotencial: 0,
});

function metricas(a: Omit<Acum, "remisiones">, ventas: number): MetricasRentabilidad {
  const publicidadTotal = a.publicidadDirecta + a.publicidadProrrateada;
  const costoTotal = a.costoDirecto + a.terminal + a.comision + publicidadTotal;
  const margenNeto = a.ingreso - costoTotal;
  const utilidadBruta = a.ingreso - (a.costoDirecto + a.terminal + a.comision);
  const poas = publicidadTotal > 0 ? r2(utilidadBruta / publicidadTotal) : null;
  const poasProyectado =
    publicidadTotal > 0
      ? r2((utilidadBruta + (a.utilidadPotencial || 0)) / publicidadTotal)
      : null;
  const cpl = publicidadTotal > 0 && a.leads > 0 ? r2(publicidadTotal / a.leads) : null;

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
    poas,
    poasProyectado,
    cac: ventas > 0 && publicidadTotal > 0 ? r2(publicidadTotal / ventas) : null,
    ventas,
    leads: a.leads || 0,
    cpl,
    cotizacionesCount: a.cotizacionesCount || 0,
    montoCotizado: r2(a.montoCotizado || 0),
    utilidadPotencial: r2(a.utilidadPotencial || 0),
  };
}

/** Clasifica prospecto o cotización a su subcuenta contable de marketing correspondiente */
function resolverSubcuenta(
  subcuentas: any[],
  campaignName?: string | null,
  tipoNegocio?: string | null,
  servicioTipo?: string | null,
  notas?: string | null
): string | null {
  const camp = (campaignName || "").toLowerCase();
  const tipo = (tipoNegocio || "").toLowerCase();
  const serv = (servicioTipo || "").toLowerCase();
  const notStr = (notas || "").toLowerCase();

  // 1. Aljibes y cisternas (601-01-008)
  if (
    camp.includes("cisterna") || tipo.includes("cisterna") || serv.includes("cisterna") || notStr.includes("cisterna") ||
    camp.includes("aljibe") || tipo.includes("aljibe") || notStr.includes("aljibe")
  ) {
    return "601-01-008";
  }
  // 2. Tinacos (601-01-009)
  if (camp.includes("tinaco") || tipo.includes("tinaco") || serv.includes("tinaco") || notStr.includes("tinaco")) {
    return "601-01-009";
  }
  // 3. Calentadores solares (601-01-006)
  if (
    camp.includes("calentador") || tipo.includes("calentador") || serv.includes("calentador") || notStr.includes("calentador") ||
    camp.includes("solar") || tipo.includes("solar")
  ) {
    return "601-01-006";
  }
  // 4. Seguridad y Alarmas (601-01-007)
  if (
    camp.includes("seguridad") || camp.includes("alarma") || camp.includes("protege") ||
    tipo.includes("seguridad") || tipo.includes("alarma") || serv.includes("seguridad") ||
    notStr.includes("camara") || notStr.includes("alarma") || notStr.includes("videoportero") || notStr.includes("dahua") || notStr.includes("dsc")
  ) {
    return "601-01-007";
  }
  // 5. Concreto y piso estampado (601-01-003)
  if (
    camp.includes("piso") || camp.includes("estamp") || camp.includes("concreto") ||
    tipo.includes("piso") || tipo.includes("estamp") || tipo.includes("concreto") ||
    serv.includes("piso") || serv.includes("estamp") || serv.includes("concreto")
  ) {
    return "601-01-003";
  }
  // 6. Sauceda Casa a Punto (601-01-004)
  if (
    camp.includes("casa a punto") || tipo.includes("casa a punto") || serv.includes("casa_a_punto") ||
    camp.includes("mantenimiento") || tipo.includes("mantenimiento-postventa")
  ) {
    return "601-01-004";
  }
  // 7. Remodelación (601-01-002)
  if (camp.includes("remodela") || tipo.includes("remodela") || serv.includes("remodela") || serv.includes("pintura")) {
    return "601-01-002";
  }
  // 8. Herrería (601-01-005)
  if (camp.includes("herreria") || tipo.includes("herreria") || serv.includes("herreria")) {
    return "601-01-005";
  }
  // 9. Inmobiliaria (601-02-001)
  if (camp.includes("compra") || camp.includes("inmob") || camp.includes("tramite") || tipo.includes("compra") || tipo.includes("tramite") || tipo.includes("asesoria_compra")) {
    return "601-02-001";
  }
  // 10. Impermeabilización (601-01-001)
  if (camp.includes("imper") || tipo.includes("imper") || serv.includes("imper")) {
    return "601-01-001";
  }

  for (const s of subcuentas) {
    const tipos = s.servicio_tipos || [];
    if (tipos.some((t: string) => camp.includes(t.toLowerCase()) || tipo.includes(t.toLowerCase()) || serv.includes(t.toLowerCase()))) {
      return s.codigo;
    }
  }

  return null;
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
  // Cierres inmobiliarios: expedientes cerrados que no son de construcción
  let qCierres = sb
    .from("expedientes")
    .select("id, ultimo_movimiento, tipo_negocio")
    .eq("etapa", "cerrado")
    .not("tipo_negocio", "ilike", "construccion%");
  // Prospectos / Leads generados en el periodo
  let qProspectos = sb
    .from("prospectos")
    .select("id, campaign_name, tipo_negocio, created_at");
  // Cotizaciones generadas en el periodo (pipeline comercial)
  let qCotizaciones = sb
    .from("cotizaciones")
    .select("id, prospecto_id, servicio_tipo, estatus, precio_final, costo_estimado, utilidad_monto, cliente_nombre_personalizado, notas_internas, created_at");

  if (fechaInicio) {
    qRent = qRent.gte("fecha", fechaInicio);
    qMkt = qMkt.gte("fecha_operacion", fechaInicio);
    qIngInmob = qIngInmob.gte("fecha_operacion", fechaInicio);
    qCierres = qCierres.gte("ultimo_movimiento", fechaInicio);
    qProspectos = qProspectos.gte("created_at", fechaInicio);
    qCotizaciones = qCotizaciones.gte("created_at", fechaInicio);
  }
  if (fechaFin) {
    const finIso = fechaFin.includes("T") ? fechaFin : `${fechaFin}T23:59:59`;
    qRent = qRent.lte("fecha", fechaFin);
    qMkt = qMkt.lte("fecha_operacion", fechaFin);
    qIngInmob = qIngInmob.lte("fecha_operacion", fechaFin);
    qCierres = qCierres.lte("ultimo_movimiento", fechaFin);
    qProspectos = qProspectos.lte("created_at", finIso);
    qCotizaciones = qCotizaciones.lte("created_at", finIso);
  }

  const [resRent, resMkt, resIng, resCierres, resSub, resCc, resProspectos, resCotizaciones] = await Promise.all([
    qRent,
    qMkt,
    qIngInmob,
    qCierres,
    sb.from("marketing_subcuentas").select("codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id, es_general, orden, servicio_tipos"),
    sb.from("business_units").select("id, nombre, codigo, activo"),
    qProspectos,
    qCotizaciones,
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

  // ---- Leads y Cotizaciones (Pipeline Comercial) ----
  const prospectosList = resProspectos.data || [];
  const cotizacionesList = resCotizaciones.data || [];
  const prospectosMap = new Map<string, any>(prospectosList.map((p: any) => [p.id, p]));

  for (const p of prospectosList) {
    const cod = resolverSubcuenta(subcuentas, p.campaign_name, p.tipo_negocio);
    if (cod) {
      linea(cod, null).leads += 1;
    }
  }

  for (const c of cotizacionesList) {
    if (c.estatus === "rechazada" || c.estatus === "cancelada") continue;
    const p = prospectosMap.get(c.prospecto_id);
    const cod =
      resolverSubcuenta(
        subcuentas,
        p?.campaign_name,
        p?.tipo_negocio,
        c.servicio_tipo,
        c.notas_internas
      ) || "601-01-001";

    const precio = Number(c.precio_final || 0);
    const costo = Number(c.costo_estimado || 0);
    const utilidad = Number(c.utilidad_monto || (precio - costo));

    const l = linea(cod, null);
    l.cotizacionesCount += 1;
    l.montoCotizado += precio;
    l.utilidadPotencial += utilidad;
  }

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
  // Se excluyen los "otro" y los que tienen remisión de venta (son obras)
  const { data: expConRemision } = await sb
    .from("remisiones_facturas")
    .select("expediente_id")
    .not("expediente_id", "is", null);
  const idsConRemision = new Set((expConRemision || []).map((r: any) => r.expediente_id));
  const cierresInmobiliarios = (resCierres.data || []).filter(
    (e: any) => e.tipo_negocio && e.tipo_negocio !== "otro" && !idsConRemision.has(e.id)
  ).length;

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
    a.leads += l.leads;
    a.cotizacionesCount += l.cotizacionesCount;
    a.montoCotizado += l.montoCotizado;
    a.utilidadPotencial += l.utilidadPotencial;
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
    tot.leads += c.leads;
    tot.cotizacionesCount += c.cotizacionesCount;
    tot.montoCotizado += c.montoCotizado;
    tot.utilidadPotencial += c.utilidadPotencial;
    ventasTot += c.ventas;
  });

  return {
    centros: centrosLista,
    productos: productosResultado,
    totales: metricas(tot, ventasTot),
    publicidadSinProrratear: r2(publicidadSinProrratear),
  };
}
