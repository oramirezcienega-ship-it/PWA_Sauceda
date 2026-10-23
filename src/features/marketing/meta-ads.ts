import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { subcuentaPorTexto, type SubcuentaMarketingBase } from "@/lib/subcuentas-marketing";

/**
 * Meta Ads → CRM. Descarga el gasto diario por campaña y lo deja en:
 *   meta_ads_gastos      capa contable (una fila por campaña y día, clasificada por subcuenta)
 *   analytics_marketing  capa de métricas del Dashboard Inteligente (una fila por día)
 *   transactions         un movimiento por mes y subcuenta (origen 'meta_ads') en el P&L
 *
 * Corre sola cada día (tarea programada de Coolify → /api/marketing/cron-meta-ads)
 * y también desde el botón "Sincronizar Historial de Publicidad".
 *
 * Variables de entorno:
 *   META_ADS_ACCESS_TOKEN  token de un usuario del sistema del Business Manager con
 *                          ads_read y caducidad "Nunca" (los de usuario caducan)
 *   META_AD_ACCOUNT_ID     cuenta publicitaria, sin el prefijo act_ (ej. 1269333735358072)
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const hoyISO = () => new Date().toISOString().split("T")[0];
const GRAPH = "https://graph.facebook.com/v20.0";

/** Estatus de meta_ads_gastos (restricción meta_ads_gastos_estatus_contable_check). */
export const ESTATUS_APLICADO = "APLICADO_CRM";
export const ESTATUS_RECHAZADO = "RECHAZADO";
export const estaAplicado = (estatus: string | null, transactionId: string | null) =>
  Boolean(transactionId) && (estatus === ESTATUS_APLICADO || estatus === "CONTABILIZADO");

// ============================================================
// Agrupación y aplicación mensual en Finanzas
// ============================================================

export interface GrupoImportacionMeta {
  codigoSubcuenta: string;
  nombreSubcuenta: string;
  cuentaMayor: string;
  centroCostos: string;
  businessUnitId: string | null;
  productoServicio: string;
  campanas: string[];
  registros: number;
  gasto: number;
  impresiones: number;
  clics: number;
  /** Monto ya aplicado (APLICADO_CRM) en Finanzas para este mes y subcuenta. */
  contabilizado: number;
  /** Registros diarios todavía sin contabilizar. */
  pendientes: number;
  transactionId: string | null;
}

export const rangoMes = (mes: string) => {
  const [anio, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const fin = new Date(anio, m, 0).toISOString().split("T")[0];
  return { inicio, fin };
};

/** Agrupa por subcuenta el gasto de Meta Ads de un mes (formato YYYY-MM). */
export async function agruparMetaAdsMes(sb: SupabaseClient, mes: string): Promise<GrupoImportacionMeta[]> {
  const { inicio, fin } = rangoMes(mes);

  const [{ data: filas, error }, { data: subcuentas }, { data: centros }] = await Promise.all([
    sb
      .from("meta_ads_gastos")
      .select("campaign_name, centro_costos, cuenta_mayor, codigo_subcuenta, nombre_subcuenta, producto_servicio, gasto, impresiones, clics, estatus_contable, transaction_id")
      .gte("fecha_inicio", inicio)
      .lte("fecha_inicio", fin),
    sb.from("marketing_subcuentas").select("codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id"),
    sb.from("business_units").select("id, codigo"),
  ]);
  if (error) throw new Error(error.message);

  const ccPorCodigo = new Map<string, string>();
  (centros || []).forEach((c: any) => c.codigo && ccPorCodigo.set(c.codigo, c.id));
  const subPorCodigo = new Map<string, any>();
  (subcuentas || []).forEach((s: any) => subPorCodigo.set(s.codigo, s));

  const grupos = new Map<string, GrupoImportacionMeta & { _campanas: Set<string> }>();
  for (const f of filas || []) {
    if (f.estatus_contable === ESTATUS_RECHAZADO) continue;
    const codigo = f.codigo_subcuenta || "SIN-SUBCUENTA";
    const sub = subPorCodigo.get(codigo);
    const g =
      grupos.get(codigo) ||
      ({
        codigoSubcuenta: codigo,
        nombreSubcuenta: sub?.nombre || f.nombre_subcuenta || "Sin subcuenta",
        cuentaMayor: sub ? `${sub.cuenta_mayor_codigo} ${sub.cuenta_mayor_nombre}` : f.cuenta_mayor || "",
        centroCostos: f.centro_costos || "",
        businessUnitId: sub?.business_unit_id || ccPorCodigo.get(f.centro_costos) || null,
        productoServicio: f.producto_servicio || "",
        campanas: [],
        registros: 0,
        gasto: 0,
        impresiones: 0,
        clics: 0,
        contabilizado: 0,
        pendientes: 0,
        transactionId: null,
        _campanas: new Set<string>(),
      } as GrupoImportacionMeta & { _campanas: Set<string> });

    const gasto = Number(f.gasto || 0);
    g.registros += 1;
    g.gasto += gasto;
    g.impresiones += Number(f.impresiones || 0);
    g.clics += Number(f.clics || 0);
    if (f.campaign_name) g._campanas.add(f.campaign_name);
    if (estaAplicado(f.estatus_contable, f.transaction_id)) {
      g.contabilizado += gasto;
      g.transactionId = g.transactionId || f.transaction_id;
    } else {
      g.pendientes += 1;
    }
    grupos.set(codigo, g);
  }

  return Array.from(grupos.values())
    .map(({ _campanas, ...g }) => ({
      ...g,
      campanas: Array.from(_campanas),
      gasto: r2(g.gasto),
      contabilizado: r2(g.contabilizado),
    }))
    .sort((a, b) => a.codigoSubcuenta.localeCompare(b.codigoSubcuenta));
}

/**
 * Aplica el gasto de Meta Ads de un mes: crea o actualiza un movimiento por
 * subcuenta (origen meta_ads, id "YYYY-MM|subcuenta") con el total del mes y
 * marca los registros diarios como APLICADO_CRM ligados a ese movimiento.
 * Es idempotente: volver a aplicarlo solo actualiza el total.
 */
export async function aplicarMetaAdsMes(
  sb: SupabaseClient,
  datos: { mes: string; moneyAccountId: string | null; pagado: boolean; subcuentas?: string[] }
): Promise<{ ok: boolean; movimientos: number; total: number; error?: string }> {
  const { inicio, fin } = rangoMes(datos.mes);

  const grupos = (await agruparMetaAdsMes(sb, datos.mes)).filter(
    (g) =>
      g.codigoSubcuenta !== "SIN-SUBCUENTA" &&
      (!datos.subcuentas || datos.subcuentas.includes(g.codigoSubcuenta))
  );

  // Movimientos de subcuentas que se quedaron sin gasto en el mes (sus campañas se
  // reclasificaron o se ignoraron): se eliminan para no dejar totales viejos.
  if (!datos.subcuentas) {
    const vigentes = new Set(
      grupos.filter((g) => g.businessUnitId).map((g) => `${datos.mes}|${g.codigoSubcuenta}`)
    );
    const { data: movs } = await sb
      .from("transactions")
      .select("id, origen_id")
      .eq("origen_modulo", "meta_ads")
      .like("origen_id", `${datos.mes}|%`);
    for (const t of movs || []) {
      if (vigentes.has(t.origen_id)) continue;
      await sb.from("transactions").delete().eq("id", t.id);
    }
  }

  if (grupos.length === 0) return { ok: false, movimientos: 0, total: 0, error: "No hay gasto por importar en ese mes." };

  const { data: cat } = await sb
    .from("categories")
    .select("id")
    .eq("linea_pnl", "costo_marketing")
    .eq("activo", true)
    .limit(1)
    .maybeSingle();
  if (!cat) return { ok: false, movimientos: 0, total: 0, error: "No hay una categoría activa de Marketing y Publicidad." };

  // El cargo de Meta se registra al cierre del mes (o hoy si el mes sigue en curso)
  const hoy = hoyISO();
  const fechaOperacion = fin < hoy ? fin : hoy;

  let movimientos = 0;
  let total = 0;
  for (const g of grupos) {
    if (!g.businessUnitId) continue;
    const origenId = `${datos.mes}|${g.codigoSubcuenta}`;

    const { data: existente } = await sb
      .from("transactions")
      .select("id, estado, fecha_pago, money_account_id")
      .eq("origen_modulo", "meta_ads")
      .eq("origen_id", origenId)
      .maybeSingle();

    const yaPagado = existente?.estado === "pagado";
    const estado = datos.pagado || yaPagado ? "pagado" : "pendiente";
    const payload = {
      fecha_operacion: fechaOperacion,
      fecha_pago: estado === "pagado" ? existente?.fecha_pago || fechaOperacion : null,
      tipo: "egreso",
      categoria_id: cat.id,
      business_unit_id: g.businessUnitId,
      codigo_subcuenta: g.codigoSubcuenta,
      money_account_id: datos.moneyAccountId || existente?.money_account_id || null,
      monto_total: g.gasto,
      concepto: `Meta Ads ${datos.mes} - ${g.nombreSubcuenta}`,
      contraparte: "Meta Platforms (Facebook / Instagram Ads)",
      estado,
      origen_modulo: "meta_ads",
      origen_id: origenId,
      origen_concepto: "gasto",
      updated_at: new Date().toISOString(),
    };

    let transactionId = existente?.id || null;
    if (existente) {
      const { error } = await sb.from("transactions").update(payload).eq("id", existente.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: nuevo, error } = await sb
        .from("transactions")
        .insert({ ...payload, is_demo: false })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      transactionId = nuevo.id;
    }

    const { error: errMeta } = await sb
      .from("meta_ads_gastos")
      .update({
        estatus_contable: ESTATUS_APLICADO,
        transaction_id: transactionId,
        updated_at: new Date().toISOString(),
      })
      .eq("codigo_subcuenta", g.codigoSubcuenta)
      .neq("estatus_contable", ESTATUS_RECHAZADO)
      .gte("fecha_inicio", inicio)
      .lte("fecha_inicio", fin);
    if (errMeta) throw new Error(errMeta.message);

    movimientos++;
    total += g.gasto;
  }

  return { ok: true, movimientos, total: r2(total) };
}

// ============================================================
// Descarga desde Meta y sincronización
// ============================================================

/** Especialidades que no salen de las palabras clave de obra (inmobiliaria e institucional). */
const REGLAS_CAMPANA: [string, RegExp][] = [
  // Servicios para el hogar sin subcuenta propia (antes que "casa" de inmobiliaria)
  ["601-01-004", /casa a punto|seguridad|alarma|camara|calentador|solar/],
  ["601-02-001", /compra|tramite|credito|infonavit|fovissste/],
  ["601-00-001", /whatsapp|mensaje/],
  ["601-02-002", /lead|inmobil|casa|propiedad|vende|renta/],
  ["601-00-002", /video|marca|branding|alcance|reconocimiento|remarketing|ecosistema/],
];

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Subcuenta de una campaña nueva por su nombre (las conocidas conservan su clasificación). */
export function subcuentaDeCampana(nombre: string, subcuentas: SubcuentaMarketingBase[]): string | null {
  const porObra = subcuentaPorTexto(nombre, subcuentas);
  if (porObra) return porObra;
  const t = normalizar(nombre);
  const regla = REGLAS_CAMPANA.find(([codigo, re]) => re.test(t) && subcuentas.some((s) => s.codigo === codigo));
  return regla?.[0] || null;
}

// ============================================================
// Reglas de clasificación (tabla reglas_clasificacion)
// ============================================================

export const ORIGEN_META = "meta_ads";

export interface ReglaMeta {
  criterio_valor: string;
  nombre: string | null;
  estado: "confirmada" | "sugerida" | "pendiente";
  accion: "clasificar" | "ignorar";
  codigo_subcuenta: string | null;
  producto_nombre: string | null;
}

/** Reglas de Meta por campaign_id. */
export async function reglasMetaPorCampana(sb: SupabaseClient): Promise<Map<string, ReglaMeta>> {
  const { data, error } = await sb
    .from("reglas_clasificacion")
    .select("criterio_valor, nombre, estado, accion, codigo_subcuenta, producto_nombre")
    .eq("origen", ORIGEN_META)
    .eq("criterio_tipo", "campaign_id");
  if (error) throw new Error(`reglas_clasificacion: ${error.message}`);
  return new Map((data || []).map((r: any) => [r.criterio_valor, r as ReglaMeta]));
}

/** Catálogo de subcuentas y una función que traduce una regla a las columnas de meta_ads_gastos. */
async function cargarDestinos(sb: SupabaseClient) {
  const [{ data: subcuentasData }, { data: centros }, { data: productos }] = await Promise.all([
    sb
      .from("marketing_subcuentas")
      .select("codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id, servicio_tipos, es_general")
      .eq("activo", true),
    sb.from("business_units").select("id, codigo"),
    sb
      .from("meta_ads_gastos")
      .select("codigo_subcuenta, producto_servicio")
      .not("codigo_subcuenta", "is", null)
      .not("producto_servicio", "is", null)
      .order("fecha_inicio", { ascending: false })
      .limit(500),
  ]);
  const subcuentas = (subcuentasData || []) as (SubcuentaMarketingBase & Record<string, any>)[];
  const subPorCodigo = new Map(subcuentas.map((s) => [s.codigo, s]));
  const ccCodigo = new Map((centros || []).map((c: any) => [c.id, c.codigo]));
  // Producto por defecto de cada subcuenta: el último que se usó
  const productoPorSubcuenta = new Map<string, string>();
  (productos || []).forEach((p: any) => {
    if (!productoPorSubcuenta.has(p.codigo_subcuenta)) productoPorSubcuenta.set(p.codigo_subcuenta, p.producto_servicio);
  });

  const clasificacion = (regla: ReglaMeta | null | undefined) => {
    const codigo = regla && regla.accion === "clasificar" ? regla.codigo_subcuenta : null;
    const sub = codigo ? subPorCodigo.get(codigo) : null;
    return {
      centro_costos: (sub && ccCodigo.get(sub.business_unit_id)) || null,
      cuenta_mayor: sub ? `${sub.cuenta_mayor_codigo} ${sub.cuenta_mayor_nombre}` : null,
      codigo_subcuenta: sub ? codigo : null,
      nombre_subcuenta: sub?.nombre || null,
      producto_servicio: sub ? regla?.producto_nombre || productoPorSubcuenta.get(codigo!) || null : null,
    };
  };

  return { subcuentas, productoPorSubcuenta, clasificacion };
}

/**
 * Aplica la regla actual de una campaña a todos sus días y recalcula en Finanzas
 * los meses afectados. Se llama al confirmar o corregir una regla.
 */
export async function reclasificarCampanaMeta(sb: SupabaseClient, campaignId: string): Promise<string[]> {
  const [destinos, reglas] = await Promise.all([cargarDestinos(sb), reglasMetaPorCampana(sb)]);
  const regla = reglas.get(campaignId);
  const ahora = new Date().toISOString();

  const { data: dias } = await sb.from("meta_ads_gastos").select("fecha_inicio").eq("campaign_id", campaignId);
  const meses = Array.from(new Set((dias || []).map((d: any) => String(d.fecha_inicio).slice(0, 7)))).sort();
  if (meses.length === 0) return [];

  if (regla?.accion === "ignorar") {
    await sb
      .from("meta_ads_gastos")
      .update({ ...destinos.clasificacion(null), estatus_contable: ESTATUS_RECHAZADO, transaction_id: null, updated_at: ahora })
      .eq("campaign_id", campaignId);
  } else {
    // Cambia de subcuenta: se desliga del movimiento anterior y se vuelve a aplicar
    await sb
      .from("meta_ads_gastos")
      .update({ ...destinos.clasificacion(regla), estatus_contable: "PENDIENTE_VALIDACION", transaction_id: null, updated_at: ahora })
      .eq("campaign_id", campaignId);
  }

  for (const mes of meses) {
    await aplicarMetaAdsMes(sb, { mes, moneyAccountId: null, pagado: false });
  }
  return meses;
}

interface InsightCampana {
  campaign_id: string;
  campaign_name: string;
  account_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  date_start: string;
  date_stop: string;
}

class TokenMetaInvalido extends Error {
  constructor() {
    super(
      "El token de Meta caducó o no es válido. Genera uno de usuario del sistema con ads_read y caducidad \"Nunca\" y guárdalo en META_ADS_ACCESS_TOKEN."
    );
  }
}

async function descargarInsights(token: string, cuenta: string, desde: string, hasta: string): Promise<InsightCampana[]> {
  const params = new URLSearchParams({
    access_token: token,
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since: desde, until: hasta }),
    fields: "campaign_id,campaign_name,account_name,spend,impressions,reach,clicks,cpc,cpm,ctr",
    limit: "500",
  });
  let url: string | null = `${GRAPH}/act_${cuenta}/insights?${params.toString()}`;
  const filas: InsightCampana[] = [];
  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json?.error;
      if (e?.code === 190) throw new TokenMetaInvalido();
      throw new Error(`Error de Meta (${res.status}): ${e?.message || "sin detalle"}`);
    }
    filas.push(...(json.data || []));
    url = json.paging?.next || null;
  }
  return filas;
}

export interface ResultadoSyncMeta {
  ok: boolean;
  desde: string;
  hasta: string;
  dias: number;
  registros: number;
  gasto: number;
  mesesAplicados: string[];
  /** Campañas cuya clasificación falta confirmar en Finanzas → Por clasificar. */
  campanasPorConfirmar: string[];
  error?: string;
}

/**
 * Sincroniza Meta Ads con el CRM. Sin fechas toma desde el día 1 del mes anterior
 * (Meta ajusta días recientes y así el cierre del mes pasado queda exacto).
 */
export async function sincronizarMetaAds(opciones: {
  token?: string | null;
  adAccountId?: string | null;
  desde?: string | null;
  hasta?: string | null;
  aplicarEnFinanzas?: boolean;
} = {}): Promise<ResultadoSyncMeta> {
  const hoy = new Date();
  const hasta = opciones.hasta || hoyISO();
  const desde =
    opciones.desde || new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().split("T")[0];
  const base: ResultadoSyncMeta = {
    ok: false, desde, hasta, dias: 0, registros: 0, gasto: 0, mesesAplicados: [], campanasPorConfirmar: [],
  };

  // El token del formulario va primero; si caducó (p. ej. uno viejo guardado en el
  // navegador) se reintenta con el del servidor.
  const tokens = Array.from(
    new Set([(opciones.token || "").trim(), (process.env.META_ADS_ACCESS_TOKEN || "").trim()].filter(Boolean))
  );
  const cuenta = ((opciones.adAccountId || "").trim() || process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  if (tokens.length === 0) return { ...base, error: "Falta el token de Meta (META_ADS_ACCESS_TOKEN)." };
  if (!cuenta) return { ...base, error: "Falta la cuenta publicitaria de Meta (META_AD_ACCOUNT_ID)." };

  try {
    const sb = supabaseServidor();
    let descargados: InsightCampana[] | null = null;
    for (let t = 0; t < tokens.length && !descargados; t++) {
      try {
        descargados = await descargarInsights(tokens[t], cuenta, desde, hasta);
      } catch (err) {
        if (!(err instanceof TokenMetaInvalido) || t === tokens.length - 1) throw err;
      }
    }
    const insights = (descargados || []).filter(
      (i) => Number(i.spend || 0) > 0 || Number(i.impressions || 0) > 0
    );

    // Clasificación por reglas (Finanzas → Por clasificar). Una campaña nueva recibe una
    // regla sugerida por su nombre (se aplica provisionalmente) o pendiente (no entra al P&L).
    const destinos = await cargarDestinos(sb);
    const reglas = await reglasMetaPorCampana(sb);
    const nuevas = new Map<string, ReglaMeta>();
    for (const i of insights) {
      if (reglas.has(i.campaign_id) || nuevas.has(i.campaign_id)) continue;
      const codigo = subcuentaDeCampana(i.campaign_name || "", destinos.subcuentas);
      nuevas.set(i.campaign_id, {
        criterio_valor: i.campaign_id,
        nombre: i.campaign_name,
        estado: codigo ? "sugerida" : "pendiente",
        accion: "clasificar",
        codigo_subcuenta: codigo,
        producto_nombre: (codigo && destinos.productoPorSubcuenta.get(codigo)) || null,
      });
    }
    if (nuevas.size > 0) {
      const { error } = await sb.from("reglas_clasificacion").upsert(
        Array.from(nuevas.values()).map((r) => ({ ...r, origen: ORIGEN_META, criterio_tipo: "campaign_id" })),
        { onConflict: "origen,criterio_tipo,criterio_valor", ignoreDuplicates: true }
      );
      if (error) throw new Error(`reglas_clasificacion: ${error.message}`);
      nuevas.forEach((r, id) => reglas.set(id, r));
    }

    const porConfirmar = new Set<string>();
    const filas = insights.map((i) => {
      const regla = reglas.get(i.campaign_id)!;
      if (regla.estado !== "confirmada") porConfirmar.add(i.campaign_name);
      return {
        fecha_inicio: i.date_start,
        fecha_fin: i.date_stop,
        account_id: `act_${cuenta}`,
        // Siempre presente: en un upsert por lotes una columna omitida se manda como NULL
        account_name: i.account_name || "Sauceda",
        campaign_id: i.campaign_id,
        campaign_name: i.campaign_name,
        ...destinos.clasificacion(regla),
        gasto: r2(Number(i.spend || 0)),
        impresiones: Number(i.impressions || 0),
        alcance: Number(i.reach || 0),
        clics: Number(i.clicks || 0),
        cpc: r2(Number(i.cpc || 0)),
        cpm: r2(Number(i.cpm || 0)),
        ctr: r2(Number(i.ctr || 0)),
        updated_at: new Date().toISOString(),
      };
    });

    // Sin estatus_contable ni transaction_id: las filas nuevas nacen pendientes y las
    // ya aplicadas conservan su vínculo (el total se corrige al volver a aplicar el mes).
    for (let k = 0; k < filas.length; k += 500) {
      const { error } = await sb
        .from("meta_ads_gastos")
        .upsert(filas.slice(k, k + 500), { onConflict: "campaign_id,fecha_inicio,fecha_fin" });
      if (error) throw new Error(`meta_ads_gastos: ${error.message}`);
    }

    // Campañas marcadas como "ignorar": sus días no entran al estado de resultados
    const ignoradas = Array.from(new Set(filas.map((f) => f.campaign_id))).filter(
      (id) => reglas.get(id)?.accion === "ignorar"
    );
    if (ignoradas.length > 0) {
      await sb
        .from("meta_ads_gastos")
        .update({ estatus_contable: ESTATUS_RECHAZADO, transaction_id: null, updated_at: new Date().toISOString() })
        .in("campaign_id", ignoradas)
        .gte("fecha_inicio", desde)
        .lte("fecha_inicio", hasta);
    }

    // Métricas diarias del Dashboard Inteligente, con los prospectos del CRM de cada día
    const porDia = new Map<string, { gasto: number; clics: number; impresiones: number }>();
    for (const f of filas) {
      const d = porDia.get(f.fecha_inicio) || { gasto: 0, clics: 0, impresiones: 0 };
      d.gasto += f.gasto;
      d.clics += f.clics;
      d.impresiones += f.impresiones;
      porDia.set(f.fecha_inicio, d);
    }
    const { data: prospectos } = await sb
      .from("prospectos")
      .select("created_at")
      .gte("created_at", `${desde}T00:00:00Z`)
      .lte("created_at", `${hasta}T23:59:59Z`);
    const leadsPorDia = new Map<string, number>();
    (prospectos || []).forEach((p: any) => {
      const d = new Date(p.created_at).toISOString().split("T")[0];
      leadsPorDia.set(d, (leadsPorDia.get(d) || 0) + 1);
    });
    if (porDia.size > 0) {
      await sb.from("analytics_marketing").delete().eq("canal", "facebook").gte("fecha", desde).lte("fecha", hasta);
      const { error: errAn } = await sb.from("analytics_marketing").insert(
        Array.from(porDia.entries()).map(([fecha, d]) => ({
          fecha,
          canal: "facebook",
          gasto_publicitario: r2(d.gasto),
          clics: d.clics,
          impresiones: d.impresiones,
          leads_registrados_crm: leadsPorDia.get(fecha) || 0,
        }))
      );
      if (errAn) throw new Error(`analytics_marketing: ${errAn.message}`);
    }

    // Reflejar en el estado de resultados cada mes sincronizado
    const mesesAplicados: string[] = [];
    if (opciones.aplicarEnFinanzas !== false) {
      const meses = Array.from(new Set(filas.map((f) => f.fecha_inicio.slice(0, 7)))).sort();
      for (const mes of meses) {
        const res = await aplicarMetaAdsMes(sb, { mes, moneyAccountId: null, pagado: false });
        if (res.ok) mesesAplicados.push(mes);
      }
    }

    return {
      ok: true,
      desde,
      hasta,
      dias: porDia.size,
      registros: filas.length,
      gasto: r2(filas.reduce((a, f) => a + f.gasto, 0)),
      mesesAplicados,
      campanasPorConfirmar: Array.from(porConfirmar),
    };
  } catch (err: any) {
    return { ...base, error: err?.message || "Error al sincronizar Meta Ads." };
  }
}
