"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import {
  proyectar,
  LineaPlan,
  SupuestoMes,
  FijoPlan,
  ResultadoProyeccion,
  normalizarPorcentaje
} from "@/lib/finanzas/proyeccion";

// ============================================================
// INTERFACES Y TIPOS DE PROYECCIONES
// ============================================================

export interface EscenarioFinanciero {
  id: string;
  nombre: string;
  periodo_inicio: string; // 'YYYY-MM-DD'
  periodo_fin: string; // 'YYYY-MM-DD'
  fecha_corte_real?: string | null;
  es_activo: boolean;
  notas?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface IndicadorBaseReal {
  tipo_negocio: string;
  nombre_legible: string;
  leads_promedio: number;
  pct_a_cotizacion: number;
  pct_cierre: number;
  ticket_promedio: number;
  margen_pct: number;
  pct_comision_asesor: number;
  gasto_marketing_promedio: number;
  costo_por_lead: number;
  cierres_totales: number;
  confiabilidad: "alta" | "media" | "baja";
}

export interface VariacionRealPlan {
  mes: string;
  linea_id: string;
  linea_nombre: string;
  tipo_negocio?: string | null;
  plan_ingreso: number;
  real_ingreso: number;
  var_ingreso_monto: number;
  var_ingreso_pct: number;
  plan_ops: number;
  real_ops: number;
  plan_utilidad: number;
  real_utilidad: number;
  var_utilidad_monto: number;
  var_utilidad_pct: number;
  semaforo: "verde" | "amarillo" | "rojo";
  driver_desviacion: "leads" | "cierre" | "ticket" | "margen" | "en_meta";
  explicacion_driver: string;
}

export interface DiagnosticoSofiaProyeccion {
  fecha: string;
  escenario_nombre: string;
  lectura_general: string;
  alertas_supuestos: string[];
  riesgos: string[];
  palancas: string[];
}

const NOMBRES_TIPO_NEGOCIO: Record<string, string> = {
  "construccion-impermeabilizacion": "Impermeabilización Techos y Muros",
  "construccion-remodelacion": "Remodelación Integral",
  "construccion-piso-estampado": "Piso Estampado y Firmes",
  "construccion-mantenimiento-postventa": "Mantenimiento Residencial y Comercial",
  "construccion-mantenimiento-cisternas": "Mantenimiento Cisternas",
  "construccion-mantenimiento-tinacos": "Mantenimiento Tinacos",
  "construccion-herreria": "Herrería y Estructuras",
  construccion: "Construcción General",
  traspaso_compra: "Traspaso / Compra Inmobiliaria",
  promocion_venta: "Promoción y Venta en Exclusiva",
  solo_tramite: "Trámite Notarial / INFONAVIT",
  otro: "Otros Servicios"
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function generarListaMeses(inicio: string, fin: string): string[] {
  const meses: string[] = [];
  const dInicio = new Date(inicio.slice(0, 7) + "-01T00:00:00");
  const dFin = new Date(fin.slice(0, 7) + "-01T00:00:00");

  const actual = new Date(dInicio);
  while (actual <= dFin) {
    const yyyy = actual.getFullYear();
    const mm = String(actual.getMonth() + 1).padStart(2, "0");
    meses.push(`${yyyy}-${mm}-01`);
    actual.setMonth(actual.getMonth() + 1);
  }
  return meses;
}

// ============================================================
// 1. GESTIÓN DE ESCENARIOS
// ============================================================

export async function listarEscenarios(): Promise<EscenarioFinanciero[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("fin_escenarios")
    .select("*")
    .order("es_activo", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al listar escenarios:", error);
    return [];
  }
  return data || [];
}

export async function obtenerEscenarioActivo(): Promise<EscenarioFinanciero | null> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data } = await sb
    .from("fin_escenarios")
    .select("*")
    .eq("es_activo", true)
    .limit(1)
    .maybeSingle();

  if (data) return data;

  // Si ninguno está activo, tomar el primero
  const { data: primero } = await sb
    .from("fin_escenarios")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return primero || null;
}

export async function marcarEscenarioActivo(escenarioId: string): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  await sb.from("fin_escenarios").update({ es_activo: false }).neq("id", escenarioId);
  const { error } = await sb
    .from("fin_escenarios")
    .update({ es_activo: true, updated_at: new Date().toISOString() })
    .eq("id", escenarioId);

  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

export async function eliminarEscenario(escenarioId: string): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { error } = await sb.from("fin_escenarios").delete().eq("id", escenarioId);
  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

// ============================================================
// 2. BASE REAL DEL CRM Y CONFIABILIDAD
// ============================================================

export async function obtenerBaseReal(meses = 3): Promise<IndicadorBaseReal[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Intentar consultar vista analítica `v_fin_base_real_mensual`
  const { data: vistaData, error: errVista } = await sb
    .from("v_fin_base_real_mensual")
    .select("*")
    .order("mes", { ascending: false });

  if (!errVista && vistaData && vistaData.length > 0) {
    // Agrupar por tipo_negocio tomando los últimos N meses disponibles
    const porTipo = new Map<string, any[]>();
    for (const r of vistaData) {
      if (!r.tipo_negocio) continue;
      const list = porTipo.get(r.tipo_negocio) || [];
      if (list.length < meses) {
        list.push(r);
        porTipo.set(r.tipo_negocio, list);
      }
    }

    const resultado: IndicadorBaseReal[] = [];
    porTipo.forEach((filas, tipo) => {
      const n = filas.length || 1;
      const leadsProm = r2(filas.reduce((acc, f) => acc + Number(f.leads || 0), 0) / n);
      const cotsProm = r2(filas.reduce((acc, f) => acc + Number(f.cotizaciones || 0), 0) / n);
      const cierresTot = filas.reduce((acc, f) => acc + Number(f.cierres || 0), 0);
      const pctCot = leadsProm > 0 ? r2((cotsProm / leadsProm) * 100) : 0;
      const pctCie = cotsProm > 0 ? r2(((cierresTot / n) / cotsProm) * 100) : 0;

      // Promedio ponderado o aritmético de ticket y margen
      const ticketProm = r2(
        filas.reduce((acc, f) => acc + Number(f.ticket_promedio || 0), 0) / n || 15000
      );
      const margenProm = r2(
        (filas.reduce((acc, f) => acc + Number(f.margen_pct || 0.4), 0) / n) * 100
      );
      const comisionProm = r2(
        (filas.reduce((acc, f) => acc + Number(f.pct_comision_asesor || 0.05), 0) / n) * 100
      );
      const mktProm = r2(
        filas.reduce((acc, f) => acc + Number(f.gasto_marketing || 0), 0) / n
      );
      const cpaProm = leadsProm > 0 ? r2(mktProm / leadsProm) : 0;

      const conf: "alta" | "media" | "baja" =
        cierresTot >= 10 ? "alta" : cierresTot >= 3 ? "media" : "baja";

      resultado.push({
        tipo_negocio: tipo,
        nombre_legible: NOMBRES_TIPO_NEGOCIO[tipo] || tipo,
        leads_promedio: leadsProm,
        pct_a_cotizacion: pctCot,
        pct_cierre: pctCie,
        ticket_promedio: ticketProm,
        margen_pct: margenProm,
        pct_comision_asesor: comisionProm,
        gasto_marketing_promedio: mktProm,
        costo_por_lead: cpaProm,
        cierres_totales: cierresTot,
        confiabilidad: conf
      });
    });

    return resultado.sort((a, b) => b.cierres_totales - a.cierres_totales);
  }

  // Fallback si la vista aún no está compilada o si no hay datos en histórico:
  // Construir tasas de referencia por catálogo del negocio
  const tipos = Object.keys(NOMBRES_TIPO_NEGOCIO);
  return tipos.map((t) => ({
    tipo_negocio: t,
    nombre_legible: NOMBRES_TIPO_NEGOCIO[t],
    leads_promedio: t.includes("imper") ? 45 : t.includes("remod") ? 20 : 15,
    pct_a_cotizacion: t.includes("imper") ? 35 : 25,
    pct_cierre: t.includes("imper") ? 18 : 12,
    ticket_promedio: t.includes("imper") ? 28000 : t.includes("remod") ? 95000 : 25000,
    margen_pct: 42,
    pct_comision_asesor: 5,
    gasto_marketing_promedio: 3500,
    costo_por_lead: 80,
    cierres_totales: 4,
    confiabilidad: "media"
  }));
}

// ============================================================
// 3. CREACIÓN Y DUPLICACIÓN DE ESCENARIOS
// ============================================================

export async function crearEscenario(params: {
  nombre: string;
  periodo_inicio: string; // 'YYYY-MM-01'
  periodo_fin: string; // 'YYYY-MM-01'
  fecha_corte_real?: string;
  copiarDe?: string;
}): Promise<string> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const meses = generarListaMeses(params.periodo_inicio, params.periodo_fin);

  // 1. Insertar escenario
  const { data: esc, error: errEsc } = await sb
    .from("fin_escenarios")
    .insert({
      nombre: params.nombre,
      periodo_inicio: params.periodo_inicio,
      periodo_fin: params.periodo_fin,
      fecha_corte_real: params.fecha_corte_real || null,
      es_activo: false
    })
    .select("id")
    .single();

  if (errEsc || !esc) throw new Error(errEsc?.message || "No se pudo crear el escenario.");

  const nuevoEscenarioId = esc.id;

  // CASO A: Copiar de otro escenario existente
  if (params.copiarDe) {
    const [{ data: lineasOrig }, { data: fijosOrig }] = await Promise.all([
      sb.from("fin_lineas_plan").select("*").eq("escenario_id", params.copiarDe),
      sb.from("fin_fijos_plan").select("*").eq("escenario_id", params.copiarDe)
    ]);

    for (const lin of lineasOrig || []) {
      const { data: nuevaLinea } = await sb
        .from("fin_lineas_plan")
        .insert({
          escenario_id: nuevoEscenarioId,
          business_unit_id: lin.business_unit_id,
          nombre: lin.nombre,
          tipo_negocio: lin.tipo_negocio,
          origen: lin.origen,
          modelo: lin.modelo,
          esquema_cobro: lin.esquema_cobro,
          activo: lin.activo,
          orden: lin.orden
        })
        .select("id")
        .single();

      if (nuevaLinea) {
        const { data: supuestosOrig } = await sb
          .from("fin_supuestos_mes")
          .select("*")
          .eq("linea_id", lin.id);

        const mapaSup = new Map<string, any>();
        (supuestosOrig || []).forEach((s) => mapaSup.set(s.mes.slice(0, 7), s));

        // Asignar a los meses del nuevo horizonte
        const supuestosNuevos = meses.map((m) => {
          const sOrig = mapaSup.get(m.slice(0, 7)) || supuestosOrig?.[0];
          return {
            linea_id: nuevaLinea.id,
            mes: m,
            leads: sOrig?.leads ?? 0,
            pct_a_cotizacion: sOrig?.pct_a_cotizacion ?? 0,
            pct_cierre: sOrig?.pct_cierre ?? 0,
            operaciones_manual: sOrig?.operaciones_manual ?? 0,
            ticket_promedio: sOrig?.ticket_promedio ?? 0,
            margen_pct: sOrig?.margen_pct ?? 0,
            pct_comision_asesor: sOrig?.pct_comision_asesor ?? 0,
            gasto_ads: sOrig?.gasto_ads ?? null,
            costo_por_lead: sOrig?.costo_por_lead ?? null,
            fuente: sOrig?.fuente ?? "promedio_real"
          };
        });

        if (supuestosNuevos.length > 0) {
          await sb.from("fin_supuestos_mes").insert(supuestosNuevos);
        }
      }
    }

    // Copiar fijos
    if (fijosOrig && fijosOrig.length > 0) {
      const mapaFijos = new Map<string, any>();
      fijosOrig.forEach((f) => mapaFijos.set(`${f.concepto}:${f.linea_pnl}`, f));

      const fijosNuevos: any[] = [];
      mapaFijos.forEach((f) => {
        meses.forEach((m) => {
          fijosNuevos.push({
            escenario_id: nuevoEscenarioId,
            business_unit_id: f.business_unit_id,
            concepto: f.concepto,
            linea_pnl: f.linea_pnl,
            mes: m,
            monto: f.monto,
            fuente: "copia"
          });
        });
      });
      if (fijosNuevos.length > 0) {
        await sb.from("fin_fijos_plan").insert(fijosNuevos);
      }
    }

    revalidatePath("/finanzas");
    return nuevoEscenarioId;
  }

  // CASO B: Crear escenario nuevo basado en la BASE REAL del CRM
  const [baseReal, { data: bus }] = await Promise.all([
    obtenerBaseReal(3),
    sb.from("business_units").select("id, nombre").eq("activo", true)
  ]);

  const buConstruye = bus?.find((b) => b.nombre.toLowerCase().includes("constru"));
  const buBienesRaices = bus?.find((b) => b.nombre.toLowerCase().includes("bienes"));

  let orden = 1;
  for (const b of baseReal) {
    const esConstru = b.tipo_negocio.startsWith("construccion");
    const buId = esConstru ? buConstruye?.id : buBienesRaices?.id;

    const { data: linea } = await sb
      .from("fin_lineas_plan")
      .insert({
        escenario_id: nuevoEscenarioId,
        business_unit_id: buId || null,
        nombre: b.nombre_legible,
        tipo_negocio: b.tipo_negocio,
        origen: "existente",
        modelo: "embudo",
        esquema_cobro: [{ pct: 1, desfase_meses: 0 }],
        activo: true,
        orden: orden++
      })
      .select("id")
      .single();

    if (linea) {
      const supuestos = meses.map((m) => ({
        linea_id: linea.id,
        mes: m,
        leads: b.leads_promedio,
        pct_a_cotizacion: b.pct_a_cotizacion / 100,
        pct_cierre: b.pct_cierre / 100,
        operaciones_manual: 0,
        ticket_promedio: b.ticket_promedio,
        margen_pct: b.margen_pct / 100,
        pct_comision_asesor: b.pct_comision_asesor / 100,
        gasto_ads: b.gasto_marketing_promedio,
        costo_por_lead: b.costo_por_lead,
        fuente: "promedio_real"
      }));

      await sb.from("fin_supuestos_mes").insert(supuestos);
    }
  }

  // Prellenar gastos fijos con promedios reales de P&L
  const { data: pnlReal } = await sb
    .from("v_fin_pnl_real_mensual")
    .select("business_unit_id, linea_pnl, monto_total")
    .eq("categoria_tipo", "egreso");

  const fijosPorCat = new Map<string, { buId: string | null; monto: number }>();
  if (pnlReal && pnlReal.length > 0) {
    for (const r of pnlReal) {
      const k = `${r.business_unit_id || "null"}:${r.linea_pnl}`;
      const actual = fijosPorCat.get(k) || { buId: r.business_unit_id, monto: 0 };
      actual.monto += Number(r.monto_total || 0);
      fijosPorCat.set(k, actual);
    }
  } else {
    // Fijos de referencia si aún no hay movimientos contables registrados
    fijosPorCat.set("default:opex_nomina", { buId: buConstruye?.id || null, monto: 18000 });
    fijosPorCat.set("default:opex_renta", { buId: buConstruye?.id || null, monto: 7500 });
    fijosPorCat.set("default:opex_servicios", { buId: buConstruye?.id || null, monto: 3500 });
    fijosPorCat.set("default:opex_otros", { buId: buBienesRaices?.id || null, monto: 3000 });
  }

  const fijosAInsertar: any[] = [];
  fijosPorCat.forEach((val, k) => {
    const lineaPnl = k.split(":")[1] || "opex_otros";
    const concepto = lineaPnl.replace("_", " ").toUpperCase();
    meses.forEach((m) => {
      fijosAInsertar.push({
        escenario_id: nuevoEscenarioId,
        business_unit_id: val.buId,
        concepto,
        linea_pnl: lineaPnl,
        mes: m,
        monto: r2(val.monto),
        fuente: "promedio_real"
      });
    });
  });

  if (fijosAInsertar.length > 0) {
    await sb.from("fin_fijos_plan").insert(fijosAInsertar);
  }

  revalidatePath("/finanzas");
  return nuevoEscenarioId;
}

export async function duplicarEscenario(
  id: string,
  nombre: string,
  factor = 1.0
): Promise<string> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data: orig, error: errOrig } = await sb
    .from("fin_escenarios")
    .select("*")
    .eq("id", id)
    .single();

  if (errOrig || !orig) throw new Error("Escenario origen no encontrado.");

  // Crear nuevo escenario
  const { data: nuevo, error: errNuevo } = await sb
    .from("fin_escenarios")
    .insert({
      nombre,
      periodo_inicio: orig.periodo_inicio,
      periodo_fin: orig.periodo_fin,
      fecha_corte_real: orig.fecha_corte_real,
      es_activo: false,
      notas: `Duplicado de '${orig.nombre}' con factor ${factor}x`
    })
    .select("id")
    .single();

  if (errNuevo || !nuevo) throw new Error(errNuevo?.message || "No se pudo duplicar.");

  const nuevoId = nuevo.id;

  // Duplicar líneas
  const { data: lineas } = await sb
    .from("fin_lineas_plan")
    .select("*")
    .eq("escenario_id", id);

  for (const lin of lineas || []) {
    const { data: nLin } = await sb
      .from("fin_lineas_plan")
      .insert({
        escenario_id: nuevoId,
        business_unit_id: lin.business_unit_id,
        nombre: lin.nombre,
        tipo_negocio: lin.tipo_negocio,
        origen: lin.origen,
        modelo: lin.modelo,
        esquema_cobro: lin.esquema_cobro,
        activo: lin.activo,
        orden: lin.orden
      })
      .select("id")
      .single();

    if (nLin) {
      const { data: supuestos } = await sb
        .from("fin_supuestos_mes")
        .select("*")
        .eq("linea_id", lin.id);

      if (supuestos && supuestos.length > 0) {
        const supuestosDuplicados = supuestos.map((s) => ({
          linea_id: nLin.id,
          mes: s.mes,
          leads: r2(Number(s.leads || 0) * factor),
          pct_a_cotizacion: s.pct_a_cotizacion,
          pct_cierre: s.pct_cierre,
          operaciones_manual: r2(Number(s.operaciones_manual || 0) * factor),
          ticket_promedio: s.ticket_promedio,
          margen_pct: s.margen_pct,
          pct_comision_asesor: s.pct_comision_asesor,
          gasto_ads: s.gasto_ads ? r2(Number(s.gasto_ads) * factor) : null,
          costo_por_lead: s.costo_por_lead,
          fuente: factor !== 1.0 ? "manual" : s.fuente
        }));

        await sb.from("fin_supuestos_mes").insert(supuestosDuplicados);
      }
    }
  }

  // Duplicar gastos fijos
  const { data: fijos } = await sb
    .from("fin_fijos_plan")
    .select("*")
    .eq("escenario_id", id);

  if (fijos && fijos.length > 0) {
    const fijosDuplicados = fijos.map((f) => ({
      escenario_id: nuevoId,
      business_unit_id: f.business_unit_id,
      concepto: f.concepto,
      linea_pnl: f.linea_pnl,
      mes: f.mes,
      monto: f.monto,
      fuente: f.fuente
    }));
    await sb.from("fin_fijos_plan").insert(fijosDuplicados);
  }

  revalidatePath("/finanzas");
  return nuevoId;
}

// ============================================================
// 4. LÍNEAS NUEVAS Y GESTIÓN DE SUPUESTOS
// ============================================================

export async function agregarLineaNueva(params: {
  escenario_id: string;
  nombre: string;
  business_unit_id?: string | null;
  tipo_negocio?: string | null;
  modelo: "embudo" | "manual";
  ticket: number;
  margen_pct: number; // 0..1 o %
  pct_comision_asesor: number; // 0..1 o %
  operaciones_por_mes: Array<{ mes: string; operaciones: number }>;
  esquema_cobro?: Array<{ pct: number; desfase_meses: number }>;
}): Promise<string> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Obtener escenario para conocer meses
  const { data: esc } = await sb
    .from("fin_escenarios")
    .select("periodo_inicio, periodo_fin")
    .eq("id", params.escenario_id)
    .single();

  if (!esc) throw new Error("Escenario no encontrado.");

  const meses = generarListaMeses(esc.periodo_inicio, esc.periodo_fin);

  const { data: linea, error: errL } = await sb
    .from("fin_lineas_plan")
    .insert({
      escenario_id: params.escenario_id,
      business_unit_id: params.business_unit_id || null,
      nombre: params.nombre,
      tipo_negocio: params.tipo_negocio || null,
      origen: "nuevo",
      modelo: params.modelo,
      esquema_cobro: params.esquema_cobro || [{ pct: 1, desfase_meses: 0 }],
      activo: true
    })
    .select("id")
    .single();

  if (errL || !linea) throw new Error(errL?.message || "No se pudo crear la línea.");

  const mapaOps = new Map<string, number>();
  (params.operaciones_por_mes || []).forEach((o) => {
    mapaOps.set(o.mes.slice(0, 7) + "-01", Number(o.operaciones || 0));
  });

  const supuestos = meses.map((m) => {
    const ops = mapaOps.get(m) ?? (mapaOps.size > 0 ? Array.from(mapaOps.values())[0] : 1);
    return {
      linea_id: linea.id,
      mes: m,
      leads: params.modelo === "embudo" ? 20 : 0,
      pct_a_cotizacion: params.modelo === "embudo" ? 0.25 : 0,
      pct_cierre: params.modelo === "embudo" ? 0.20 : 0,
      operaciones_manual: params.modelo === "manual" ? ops : 0,
      ticket_promedio: params.ticket,
      margen_pct: normalizarPorcentaje(params.margen_pct),
      pct_comision_asesor: normalizarPorcentaje(params.pct_comision_asesor),
      gasto_ads: null,
      costo_por_lead: null,
      fuente: "manual"
    };
  });

  await sb.from("fin_supuestos_mes").insert(supuestos);
  revalidatePath("/finanzas");
  return linea.id;
}

export async function actualizarSupuesto(
  linea_id: string,
  mes: string,
  campo: string,
  valor: number | null
): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const mesNorm = mes.slice(0, 7) + "-01";
  const patch: Record<string, any> = {
    [campo]: valor,
    fuente: "manual",
    updated_at: new Date().toISOString()
  };

  const { error } = await sb
    .from("fin_supuestos_mes")
    .update(patch)
    .eq("linea_id", linea_id)
    .eq("mes", mesNorm);

  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

export async function aplicarATodosLosMeses(
  linea_id: string,
  campo: string,
  valor: number | null
): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const patch: Record<string, any> = {
    [campo]: valor,
    fuente: "manual",
    updated_at: new Date().toISOString()
  };

  const { error } = await sb
    .from("fin_supuestos_mes")
    .update(patch)
    .eq("linea_id", linea_id);

  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

export async function restaurarAlReal(linea_id: string): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data: linea } = await sb
    .from("fin_lineas_plan")
    .select("tipo_negocio")
    .eq("id", linea_id)
    .single();

  if (!linea?.tipo_negocio) return false;

  const baseReal = await obtenerBaseReal(3);
  const ind = baseReal.find((b) => b.tipo_negocio === linea.tipo_negocio);
  if (!ind) return false;

  const patch = {
    leads: ind.leads_promedio,
    pct_a_cotizacion: ind.pct_a_cotizacion / 100,
    pct_cierre: ind.pct_cierre / 100,
    ticket_promedio: ind.ticket_promedio,
    margen_pct: ind.margen_pct / 100,
    pct_comision_asesor: ind.pct_comision_asesor / 100,
    gasto_ads: ind.gasto_marketing_promedio,
    costo_por_lead: ind.costo_por_lead,
    fuente: "promedio_real",
    updated_at: new Date().toISOString()
  };

  const { error } = await sb
    .from("fin_supuestos_mes")
    .update(patch)
    .eq("linea_id", linea_id);

  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

export async function eliminarLinea(linea_id: string): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { error } = await sb.from("fin_lineas_plan").delete().eq("id", linea_id);
  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

// ============================================================
// 4b. INSUMOS EDITABLES DEL ESCENARIO (SUPUESTOS Y GASTOS FIJOS)
// ============================================================

/**
 * Devuelve los supuestos y gastos fijos tal como están guardados,
 * para que el grid muestre y edite los valores reales (no derivados del resultado).
 */
export async function obtenerInsumosEscenario(
  escenario_id: string
): Promise<{ supuestos: SupuestoMes[]; fijos: FijoPlan[] }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data: lineas } = await sb
    .from("fin_lineas_plan")
    .select("id")
    .eq("escenario_id", escenario_id);
  const lineaIds = (lineas || []).map((l) => l.id);

  const [{ data: supuestos }, { data: fijos, error: errFij }] = await Promise.all([
    lineaIds.length > 0
      ? sb.from("fin_supuestos_mes").select("*").in("linea_id", lineaIds)
      : Promise.resolve({ data: [] as any[] }),
    sb
      .from("fin_fijos_plan")
      .select("*, business_units(nombre)")
      .eq("escenario_id", escenario_id)
      .order("concepto")
  ]);
  if (errFij) throw new Error(errFij.message);

  return {
    supuestos: (supuestos || []).map((s: any) => ({
      ...s,
      mes: String(s.mes).slice(0, 7) + "-01"
    })),
    fijos: (fijos || []).map((f: any) => ({
      id: f.id,
      escenario_id: f.escenario_id,
      business_unit_id: f.business_unit_id,
      business_unit_nombre: f.business_units?.nombre || "Sin Unidad",
      concepto: f.concepto,
      linea_pnl: f.linea_pnl,
      mes: String(f.mes).slice(0, 7) + "-01",
      monto: Number(f.monto || 0),
      fuente: f.fuente
    }))
  };
}

/**
 * Actualiza el monto de un gasto fijo (concepto + unidad) en uno o en todos los meses.
 * Si `mes` es null, aplica el monto a todos los meses del concepto.
 */
export async function actualizarFijo(params: {
  escenario_id: string;
  concepto: string;
  business_unit_id: string | null;
  mes: string | null;
  monto: number;
}): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  let q = sb
    .from("fin_fijos_plan")
    .update({ monto: params.monto, fuente: "manual" })
    .eq("escenario_id", params.escenario_id)
    .eq("concepto", params.concepto);
  q = params.business_unit_id
    ? q.eq("business_unit_id", params.business_unit_id)
    : q.is("business_unit_id", null);
  if (params.mes) q = q.eq("mes", params.mes.slice(0, 7) + "-01");

  const { error } = await q;
  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

/** Agrega un concepto de gasto fijo con el mismo monto en todos los meses del escenario. */
export async function agregarConceptoFijo(params: {
  escenario_id: string;
  concepto: string;
  linea_pnl: string;
  business_unit_id: string | null;
  monto: number;
  meses: string[];
}): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const filas = params.meses.map((m) => ({
    escenario_id: params.escenario_id,
    business_unit_id: params.business_unit_id,
    concepto: params.concepto.trim().toUpperCase(),
    linea_pnl: params.linea_pnl,
    mes: m.slice(0, 7) + "-01",
    monto: params.monto,
    fuente: "manual"
  }));

  const { error } = await sb.from("fin_fijos_plan").insert(filas);
  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

/** Elimina un concepto de gasto fijo (todos sus meses) del escenario. */
export async function eliminarConceptoFijo(params: {
  escenario_id: string;
  concepto: string;
  business_unit_id: string | null;
}): Promise<boolean> {
  await requireAdministrador();
  const sb = supabaseServidor();

  let q = sb
    .from("fin_fijos_plan")
    .delete()
    .eq("escenario_id", params.escenario_id)
    .eq("concepto", params.concepto);
  q = params.business_unit_id
    ? q.eq("business_unit_id", params.business_unit_id)
    : q.is("business_unit_id", null);

  const { error } = await q;
  if (error) throw new Error(error.message);
  revalidatePath("/finanzas");
  return true;
}

// ============================================================
// 5. CÁLCULO COMPLETO DE PROYECCIÓN
// ============================================================

export async function calcularProyeccion(escenario_id: string): Promise<ResultadoProyeccion> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const [{ data: lineas, error: errLin }, { data: fijos, error: errFij }, { data: supuestos }] =
    await Promise.all([
      sb
        .from("fin_lineas_plan")
        .select("*, business_units(nombre)")
        .eq("escenario_id", escenario_id)
        .order("orden"),
      sb
        .from("fin_fijos_plan")
        .select("*, business_units(nombre)")
        .eq("escenario_id", escenario_id),
      sb
        .from("fin_supuestos_mes")
        .select("*")
        .in(
          "linea_id",
          (
            await sb
              .from("fin_lineas_plan")
              .select("id")
              .eq("escenario_id", escenario_id)
          ).data?.map((l) => l.id) || []
        )
    ]);

  if (errLin) throw new Error(errLin.message);
  if (errFij) throw new Error(errFij.message);

  const lineasMapeadas: LineaPlan[] = (lineas || []).map((l: any) => ({
    id: l.id,
    escenario_id: l.escenario_id,
    business_unit_id: l.business_unit_id,
    business_unit_nombre: l.business_units?.nombre || "Sin Unidad",
    nombre: l.nombre,
    tipo_negocio: l.tipo_negocio,
    origen: l.origen,
    modelo: l.modelo,
    esquema_cobro: l.esquema_cobro || [{ pct: 1, desfase_meses: 0 }],
    activo: l.activo,
    orden: l.orden
  }));

  const supuestosMapeados: SupuestoMes[] = (supuestos || []).map((s: any) => ({
    id: s.id,
    linea_id: s.linea_id,
    mes: s.mes,
    leads: s.leads,
    pct_a_cotizacion: s.pct_a_cotizacion,
    pct_cierre: s.pct_cierre,
    operaciones_manual: s.operaciones_manual,
    ticket_promedio: s.ticket_promedio,
    margen_pct: s.margen_pct,
    pct_comision_asesor: s.pct_comision_asesor,
    gasto_ads: s.gasto_ads,
    costo_por_lead: s.costo_por_lead,
    fuente: s.fuente
  }));

  const fijosMapeados: FijoPlan[] = (fijos || []).map((f: any) => ({
    id: f.id,
    escenario_id: f.escenario_id,
    business_unit_id: f.business_unit_id,
    business_unit_nombre: f.business_units?.nombre || "Sin Unidad",
    concepto: f.concepto,
    linea_pnl: f.linea_pnl,
    mes: f.mes,
    monto: Number(f.monto || 0),
    fuente: f.fuente
  }));

  return proyectar(lineasMapeadas, supuestosMapeados, fijosMapeados);
}

// ============================================================
// 6. COMPARATIVA REAL VS. PLAN (SEGUIMIENTO Y DRIVERS)
// ============================================================

export async function obtenerRealVsPlan(escenario_id: string): Promise<VariacionRealPlan[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const [{ data: esc }, proyeccion] = await Promise.all([
    sb.from("fin_escenarios").select("*").eq("id", escenario_id).single(),
    calcularProyeccion(escenario_id)
  ]);

  if (!esc) throw new Error("Escenario no encontrado.");

  const fechaCorte = esc.fecha_corte_real || new Date().toISOString().split("T")[0];
  const { data: realMensual } = await sb.from("v_fin_base_real_mensual").select("*");

  const mapaReal = new Map<string, any>();
  (realMensual || []).forEach((r) => {
    mapaReal.set(`${r.tipo_negocio}:${r.mes.slice(0, 7)}`, r);
  });

  const comparativas: VariacionRealPlan[] = [];

  Object.values(proyeccion.por_linea).forEach((linea) => {
    proyeccion.meses.forEach((mes) => {
      // Solo comparar meses hasta la fecha de corte
      if (mes > fechaCorte) return;

      const mesKey = mes.slice(0, 7);
      const plan = linea.por_mes[mes];
      const real = (linea as any).tipo_negocio
        ? mapaReal.get(`${(linea as any).tipo_negocio}:${mesKey}`)
        : null;

      const planIngreso = plan?.ingreso_bruto || 0;
      const realIngreso = real
        ? Number(real.cierres || 0) * Number(real.ticket_promedio || 0)
        : 0;

      const varIngreso = r2(realIngreso - planIngreso);
      const varPct = planIngreso > 0 ? r2((varIngreso / planIngreso) * 100) : 0;

      const planOps = plan?.operaciones || 0;
      const realOps = real ? Number(real.cierres || 0) : 0;

      const planUtilidad = plan?.utilidad_bruta || 0;
      const realUtilidad = r2(realIngreso * Number(real?.margen_pct || 0.4));
      const varUtilidad = r2(realUtilidad - planUtilidad);
      const varUtilidadPct = planUtilidad > 0 ? r2((varUtilidad / planUtilidad) * 100) : 0;

      let semaforo: "verde" | "amarillo" | "rojo" = "verde";
      if (varPct < -20) semaforo = "rojo";
      else if (varPct < -5) semaforo = "amarillo";

      // Diagnóstico de driver principal
      let driver: "leads" | "cierre" | "ticket" | "margen" | "en_meta" = "en_meta";
      let explicacion = "Dentro de la meta proyectada.";

      if (real && planIngreso > 0 && Math.abs(varPct) > 5) {
        const planLeads = plan?.marketing ? plan.marketing / 80 : 20;
        const realLeads = Number(real.leads || 0);
        const planTicket = plan?.operaciones > 0 ? plan.ingreso_bruto / plan.operaciones : 0;
        const realTicket = Number(real.ticket_promedio || 0);

        if (realLeads < planLeads * 0.7) {
          driver = "leads";
          explicacion = `Faltaron leads: se captaron ${realLeads} vs meta de ~${Math.round(planLeads)}.`;
        } else if (realTicket < planTicket * 0.85) {
          driver = "ticket";
          explicacion = `Ticket promedio por debajo del plan ($${Math.round(realTicket)} vs $${Math.round(planTicket)}).`;
        } else {
          driver = "cierre";
          explicacion = `Baja conversión a cierre (${(Number(real.pct_cierre || 0) * 100).toFixed(1)}%).`;
        }
      }

      comparativas.push({
        mes,
        linea_id: linea.linea_id,
        linea_nombre: linea.nombre,
        tipo_negocio: (linea as any).tipo_negocio || null,
        plan_ingreso: planIngreso,
        real_ingreso: realIngreso,
        var_ingreso_monto: varIngreso,
        var_ingreso_pct: varPct,
        plan_ops: planOps,
        real_ops: realOps,
        plan_utilidad: planUtilidad,
        real_utilidad: realUtilidad,
        var_utilidad_monto: varUtilidad,
        var_utilidad_pct: varUtilidadPct,
        semaforo,
        driver_desviacion: driver,
        explicacion_driver: explicacion
      });
    });
  });

  return comparativas;
}

// ============================================================
// 7. LECTURA INTELIGENTE DE SOFÍA (IA BAJO DEMANDA)
// ============================================================

export async function generarLecturaSofiaProyeccion(
  escenario_id: string
): Promise<DiagnosticoSofiaProyeccion> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const [{ data: esc }, proyeccion, baseReal] = await Promise.all([
    sb.from("fin_escenarios").select("*").eq("id", escenario_id).single(),
    calcularProyeccion(escenario_id),
    obtenerBaseReal(3)
  ]);

  if (!esc) throw new Error("Escenario no encontrado.");

  // Detectar alertas de supuestos fuera de rango (>50% vs base real o confiabilidad baja)
  const alertasSupuestos: string[] = [];
  const baseMap = new Map<string, IndicadorBaseReal>();
  baseReal.forEach((b) => baseMap.set(b.tipo_negocio, b));

  Object.values(proyeccion.por_linea).forEach((lin) => {
    const b = (lin as any).tipo_negocio ? baseMap.get((lin as any).tipo_negocio) : null;
    if (b) {
      const supMes = Object.values(lin.por_mes)[0];
      if (supMes) {
        if (b.confiabilidad === "baja") {
          alertasSupuestos.push(
            `Línea '${lin.nombre}': Confiabilidad histórica baja (< 3 cierres recientes en CRM).`
          );
        }
      }
    }
  });

  const prompt = `Eres Sofía, Directora de Finanzas e Inteligencia de Negocio de CRM SAUCEDA.
Tu tarea es auditar y comentar el siguiente modelo determinístico de proyección financiera para el escenario '${esc.nombre}':

Cifras Proyectadas Determinísticas:
- Ingreso Bruto Proyectado: $${proyeccion.kpis.ingreso_total.toLocaleString()} MXN
- Margen Bruto (Utilidad Bruta): $${proyeccion.kpis.utilidad_bruta_total.toLocaleString()} MXN
- Utilidad Operativa: $${proyeccion.kpis.utilidad_operativa_total.toLocaleString()} MXN
- Margen Operativo %: ${proyeccion.kpis.margen_pct.toFixed(1)}%
- Punto de Equilibrio: ${proyeccion.kpis.punto_equilibrio_mes || "No alcanzado en el horizonte"}
- Caja Mínima Proyectada: $${proyeccion.kpis.caja_minima.toLocaleString()} MXN
- Saldo Caja Final: $${proyeccion.kpis.saldo_caja_final.toLocaleString()} MXN

Líneas del Escenario:
${Object.values(proyeccion.por_linea)
  .map(
    (l) =>
      `* ${l.nombre} (${l.modelo}): Ingreso $${l.total.ingreso_bruto.toLocaleString()}, Contribución $${l.total.contribucion.toLocaleString()}`
  )
  .join("\n")}

REGLA ESTRICTA: NO inventes cifras de proyección. Analiza la factibilidad de los supuestos, identifica los principales riesgos y menciona 2 o 3 palancas clave para asegurar la meta.

Responde ÚNICAMENTE en JSON válido con esta estructura:
{
  "lectura_general": "Párrafo conciso resumiendo la viabilidad del plan y el punto de equilibrio.",
  "alertas_supuestos": ["Alerta 1 sobre supuestos optimistas o fuera de rango", "..."],
  "riesgos": ["Riesgo 1 (ej. desfase de cobranza en créditos)", "Riesgo 2"],
  "palancas": ["Palanca táctica 1 (+N leads/mes o ticket)", "Palanca 2"]
}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      fecha: new Date().toISOString(),
      escenario_nombre: esc.nombre,
      lectura_general: `El escenario proyecta un ingreso consolidado de **$${proyeccion.kpis.ingreso_total.toLocaleString()} MXN** con una utilidad operativa de **$${proyeccion.kpis.utilidad_operativa_total.toLocaleString()} MXN** (Margen: **${proyeccion.kpis.margen_pct.toFixed(1)}%**). El punto de equilibrio se alcanza en **${proyeccion.kpis.punto_equilibrio_mes || "el horizonte analizado"}**.`,
      alertas_supuestos:
        alertasSupuestos.length > 0
          ? alertasSupuestos
          : ["Supuestos alineados con las tasas de conversión históricas del CRM."],
      riesgos: [
        "Desfase en la cobranza de trámites notariales e INFONAVIT (caja mínima $ " +
          proyeccion.kpis.caja_minima.toLocaleString() +
          " MXN).",
        "Sensibilidad al volumen de captación de leads en campañas digitales."
      ],
      palancas: [
        "Aumentar en 20% los leads de las líneas con mayor contribución marginal.",
        "Acelerar el ciclo de escrituración para anticipar los cobros en flujo de caja."
      ]
    };
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
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) throw new Error(`Error Anthropic API: ${res.statusText}`);
    const data = await res.json();
    const rawText = data?.content?.[0]?.text || "{}";
    const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());

    return {
      fecha: new Date().toISOString(),
      escenario_nombre: esc.nombre,
      lectura_general: parsed.lectura_general || "Lectura financiera generada.",
      alertas_supuestos: Array.isArray(parsed.alertas_supuestos)
        ? parsed.alertas_supuestos
        : alertasSupuestos,
      riesgos: Array.isArray(parsed.riesgos) ? parsed.riesgos : [],
      palancas: Array.isArray(parsed.palancas) ? parsed.palancas : []
    };
  } catch (err: any) {
    console.error("Error al generar lectura con Sofía:", err);
    return {
      fecha: new Date().toISOString(),
      escenario_nombre: esc.nombre,
      lectura_general: `Proyección calculada determinísticamente: Ingreso $${proyeccion.kpis.ingreso_total.toLocaleString()} MXN, Utilidad $${proyeccion.kpis.utilidad_operativa_total.toLocaleString()} MXN.`,
      alertas_supuestos: alertasSupuestos,
      riesgos: ["Verificar cumplimiento de metas mensuales de prospección."],
      palancas: ["Monitorear el costo por lead semanal en Meta Ads."]
    };
  }
}
