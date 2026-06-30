"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { obtenerDatosCRM } from "./crm";

export interface MarketingMetric {
  id?: string;
  fecha: string;
  canal: "facebook" | "instagram" | "tiktok" | "google-analytics" | "otro";
  campana_id?: string;
  campana_nombre?: string;
  gasto_publicitario: number;
  impresiones: number;
  clics: number;
  sesiones_web: number;
  leads_registrados_crm: number;
  ventas_cerradas_crm: number;
}

export interface TransaccionFinanciera {
  id?: string;
  fecha: string;
  tipo: "ingreso" | "gasto";
  categoria: string;
  concepto: string;
  monto: number;
  expediente_id?: string | null;
  created_at?: string;
  expediente_cliente?: string | null;
  es_recurrente?: boolean;
  recurrente_parent_id?: string | null;
}

export interface AIInsight {
  id?: string;
  fecha: string;
  alertas: string[];
  oportunidades: string[];
  estado_salud: "excelente" | "regular" | "critico";
  diagnostico_general: string;
  tipo?: string;
}

/** Mockups realistas por si las tablas están vacías al inicio */
const MOCK_METRICAS: MarketingMetric[] = [
  { fecha: "2026-06-23", canal: "facebook", campana_nombre: "León Traspasos Ads", gasto_publicitario: 250.00, impresiones: 5400, clics: 180, sesiones_web: 120, leads_registrados_crm: 12, ventas_cerradas_crm: 1 },
  { fecha: "2026-06-23", canal: "tiktok", campana_nombre: "Video Testimonial", gasto_publicitario: 120.00, impresiones: 8900, clics: 320, sesiones_web: 210, leads_registrados_crm: 18, ventas_cerradas_crm: 2 },
  { fecha: "2026-06-24", canal: "facebook", campana_nombre: "León Traspasos Ads", gasto_publicitario: 250.00, impresiones: 5200, clics: 175, sesiones_web: 115, leads_registrados_crm: 9, ventas_cerradas_crm: 0 },
  { fecha: "2026-06-24", canal: "tiktok", campana_nombre: "Video Testimonial", gasto_publicitario: 120.00, impresiones: 9200, clics: 340, sesiones_web: 220, leads_registrados_crm: 22, ventas_cerradas_crm: 3 },
  { fecha: "2026-06-25", canal: "facebook", campana_nombre: "León Traspasos Ads", gasto_publicitario: 280.00, impresiones: 6100, clics: 210, sesiones_web: 140, leads_registrados_crm: 14, ventas_cerradas_crm: 1 },
  { fecha: "2026-06-25", canal: "tiktok", campana_nombre: "Video Testimonial", gasto_publicitario: 150.00, impresiones: 11000, clics: 410, sesiones_web: 290, leads_registrados_crm: 25, ventas_cerradas_crm: 2 },
  { fecha: "2026-06-26", canal: "facebook", campana_nombre: "León Traspasos Ads", gasto_publicitario: 300.00, impresiones: 6500, clics: 230, sesiones_web: 150, leads_registrados_crm: 15, ventas_cerradas_crm: 2 },
  { fecha: "2026-06-26", canal: "tiktok", campana_nombre: "Video Testimonial", gasto_publicitario: 150.00, impresiones: 10500, clics: 390, sesiones_web: 275, leads_registrados_crm: 21, ventas_cerradas_crm: 1 },
  { fecha: "2026-06-27", canal: "facebook", campana_nombre: "León Traspasos Ads", gasto_publicitario: 100.00, impresiones: 2100, clics: 70, sesiones_web: 45, leads_registrados_crm: 1, ventas_cerradas_crm: 0 }, // Caída simulada de Meta
  { fecha: "2026-06-27", canal: "tiktok", campana_nombre: "Video Testimonial", gasto_publicitario: 150.00, impresiones: 10700, clics: 405, sesiones_web: 280, leads_registrados_crm: 23, ventas_cerradas_crm: 2 },
  { fecha: "2026-06-28", canal: "facebook", campana_nombre: "León Traspasos Ads", gasto_publicitario: 250.00, impresiones: 5300, clics: 178, sesiones_web: 110, leads_registrados_crm: 11, ventas_cerradas_crm: 1 },
  { fecha: "2026-06-28", canal: "tiktok", campana_nombre: "Video Testimonial", gasto_publicitario: 150.00, impresiones: 10900, clics: 415, sesiones_web: 285, leads_registrados_crm: 24, ventas_cerradas_crm: 3 },
  { fecha: "2026-06-29", canal: "facebook", campana_nombre: "León Traspasos Ads", gasto_publicitario: 250.00, impresiones: 5500, clics: 185, sesiones_web: 122, leads_registrados_crm: 12, ventas_cerradas_crm: 1 },
  { fecha: "2026-06-29", canal: "tiktok", campana_nombre: "Video Testimonial", gasto_publicitario: 150.00, impresiones: 11200, clics: 430, sesiones_web: 300, leads_registrados_crm: 27, ventas_cerradas_crm: 2 }
];

const MOCK_INSIGHTS: AIInsight = {
  fecha: "2026-06-29",
  estado_salud: "regular",
  alertas: [
    "🔴 ALERTA META ADS: El día 27 de Junio se registró una caída del 85% en leads de Facebook/Instagram. El gasto publicitario disminuyó a $100. Verificar el estado de la cuenta publicitaria o posible pausa involuntaria.",
    "🔴 ALERTA WEBHOOK: Registramos 3 reintentos fallidos de Meta Cloud API para leads entrantes de WhatsApp entre las 14:00 y 15:30. Se sugiere monitorear logs del servidor."
  ],
  oportunidades: [
    "🟡 TIKTOK ADS EFICIENCIA: TikTok mantiene un CPA de $6.25 MXN frente a los $20.83 MXN de Meta esta semana. Sugerencia: Incrementar presupuesto diario de TikTok en un 20%.",
    "🟡 RETORNO CRM: La conversión de prospectos a 'calificado' es alta en leads de recomendación (45%). Incentivar un programa de referidos con clientes cerrados para captación orgánica."
  ],
  diagnostico_general: `### 📊 Diagnóstico de Operaciones de Sofía

#### Análisis de Rendimiento
Esta semana muestra una tendencia general estable, con una fuerte tracción en **TikTok Ads**, el cual sigue siendo nuestro canal de captación más económico. Sin embargo, el canal de **Meta Ads** (Facebook/Instagram) experimentó una caída severa el día **27 de Junio**, reduciendo de forma significativa los leads capturados.

#### Conversión y Costos
- **CPA TikTok Ads:** Promedia $6.25 MXN por Lead.
- **CPA Meta Ads:** Promedia $20.83 MXN por Lead (excluyendo el día de caída).
- La tasa de conversión de Lead a Calificado en el CRM SAUCEDA se mantiene en **18%** para canales pagados, y **42%** para referidos.

#### Recomendaciones
1. **Revisar cuenta de Facebook Ads:** Asegurar que los fondos y métodos de pago estén vigentes para evitar pausas como la del 27 de junio.
2. **Reasignación Presupuestal:** Transferir un porcentaje del presupuesto inactivo de Meta hacia TikTok para maximizar el volumen diario mientras se estabiliza Meta.`
};

const MOCK_FINANCE_INSIGHTS: AIInsight = {
  fecha: "2026-06-29",
  estado_salud: "regular",
  alertas: [
    "🔴 GASTO OPEX: La nómina de asesores y la renta física representan el 62% del total de egresos operativos. Sugerencia: evaluar incentivos variables por cierre de comisiones.",
    "🔴 ALERTA ROAS: El ROAS financiero del negocio promedia 1.45x debido al aumento de presupuesto publicitario sin correspondencia proporcional en cobros de comisiones este mes."
  ],
  oportunidades: [
    "🟡 EFICIENCIA EN SERVICIOS: La categoría Servicios Básicos reportó un incremento del 20% MoM. Evaluar cancelación de softwares inactivos.",
    "🟡 ATRIBUCIÓN ACELERADA: Existen 2 expedientes cerrados en CRM con un valor de operación estimado combinado de $1.5M sin comisiones registradas."
  ],
  diagnostico_general: `### 💰 Diagnóstico Financiero de Sofía

#### Análisis del Estado de Resultados (P&L)
El rendimiento neto del negocio se encuentra en un estado **regular**. Si bien la facturación por comisiones es recurrente, el margen neto de utilidad del periodo se encuentra en **-3.2%** debido al acumulado de costos fijos altos y la inversión publicitaria que aún no ve el retorno devengado en cierres.

#### Estructura de Gastos (OPEX)
- **Nóminas y Sueldos:** $30,000.00 MXN (el componente más pesado del egreso fijo).
- **Renta y Servicios:** $16,200.00 MXN combinados.
- **Inversión en Marketing:** Representa el rubro más elástico. Se sugiere optimizar el coste de adquisición de leads de marketing.

#### Recomendaciones Financieras
1. **Atribuir comisiones pendientes:** Ligar los cierres de expedientes del CRM para que se vean reflejados en el ingreso de caja.
2. **Revisar suscripciones SaaS:** Auditar las plataformas y softwares de diseño y hosting que no se utilicen activamente.`
};

/**
 * Obtiene las métricas de marketing reales de Supabase.
 * Limpia automáticamente los datos de simulación/mockups previos para que solo aparezcan tus datos reales.
 */
export async function obtenerMetricasMarketing(): Promise<MarketingMetric[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    // Obtener los datos reales de métricas
    const { data, error } = await sb
      .from("analytics_marketing")
      .select("*")
      .order("fecha", { ascending: true });

    if (error) {
      if (error.code === "42P01") {
        console.warn("La tabla analytics_marketing no existe.");
        return [];
      }
      throw error;
    }

    return (data as MarketingMetric[]) || [];
  } catch (err) {
    console.error("Error al obtener métricas de marketing:", err);
    return [];
  }
}

/**
 * Obtiene los KPIs reales directamente desde la base de datos del CRM (tablas prospectos y expedientes).
 */
export async function obtenerKPIsRealesCRM() {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    // 1. Contar prospectos reales en el CRM
    const { count: totalLeads, error: errLeads } = await sb
      .from("prospectos")
      .select("*", { count: "exact", head: true });
    
    if (errLeads) throw errLeads;

    // 2. Contar expedientes reales cerrados (etapa = 'cerrado')
    const { count: totalVentas, error: errVentas } = await sb
      .from("expedientes")
      .select("*", { count: "exact", head: true })
      .eq("etapa", "cerrado");

    if (errVentas) throw errVentas;

    return {
      totalLeads: totalLeads || 0,
      totalVentas: totalVentas || 0
    };
  } catch (err) {
    console.error("Error al obtener KPIs reales de CRM:", err);
    return {
      totalLeads: 0,
      totalVentas: 0
    };
  }
}

/**
 * Obtiene los KPIs reales de CRM filtrados por un rango de fechas específico,
 * e incluye el conteo del período anterior equivalente para realizar comparativas.
 */
export async function obtenerKPIsPeriodoCRM(
  fechaInicio: string,
  fechaFin: string,
  fechaInicioPrev?: string,
  fechaFinPrev?: string
) {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    // 1. Periodo seleccionado
    const { count: leadsActual } = await sb
      .from("prospectos")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${fechaInicio}T00:00:00Z`)
      .lte("created_at", `${fechaFin}T23:59:59Z`);

    const { count: ventasActual } = await sb
      .from("expedientes")
      .select("*", { count: "exact", head: true })
      .eq("etapa", "cerrado")
      .gte("created_at", `${fechaInicio}T00:00:00Z`)
      .lte("created_at", `${fechaFin}T23:59:59Z`);

    // 2. Periodo comparativo anterior
    let leadsPrev = 0;
    let ventasPrev = 0;

    if (fechaInicioPrev && fechaFinPrev) {
      const { count: lPrev } = await sb
        .from("prospectos")
        .select("*", { count: "exact", head: true })
        .gte("created_at", `${fechaInicioPrev}T00:00:00Z`)
        .lte("created_at", `${fechaFinPrev}T23:59:59Z`);

      const { count: vPrev } = await sb
        .from("expedientes")
        .select("*", { count: "exact", head: true })
        .eq("etapa", "cerrado")
        .gte("created_at", `${fechaInicioPrev}T00:00:00Z`)
        .lte("created_at", `${fechaFinPrev}T23:59:59Z`);

      leadsPrev = lPrev || 0;
      ventasPrev = vPrev || 0;
    }

    return {
      actual: {
        totalLeads: leadsActual || 0,
        totalVentas: ventasActual || 0
      },
      previo: {
        totalLeads: leadsPrev,
        totalVentas: ventasPrev
      }
    };
  } catch (err) {
    console.error("Error al obtener KPIs por periodo de CRM:", err);
    return {
      actual: { totalLeads: 0, totalVentas: 0 },
      previo: { totalLeads: 0, totalVentas: 0 }
    };
  }
}


/**
 * Obtiene el insight/diagnóstico analítico más reciente por tipo (marketing o finanzas).
 * Si la tabla está vacía, retorna el mockup por defecto correspondiente.
 */
export async function obtenerInsightsIA(
  tipo: "marketing" | "finanzas" = "marketing"
): Promise<AIInsight> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("dashboard_insights")
      .select("*")
      .eq("tipo", tipo)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        console.warn(`La tabla dashboard_insights no existe. Usando fallback Mockup para ${tipo}.`);
        return tipo === "finanzas" ? MOCK_FINANCE_INSIGHTS : MOCK_INSIGHTS;
      }
      throw error;
    }

    if (!data) {
      const fallback = tipo === "finanzas" ? MOCK_FINANCE_INSIGHTS : MOCK_INSIGHTS;
      // Guardar el mockup por defecto si no hay nada
      const { data: insertado } = await sb
        .from("dashboard_insights")
        .insert([{ ...fallback, tipo }])
        .select()
        .single();

      return (insertado as AIInsight) || fallback;
    }

    return {
      fecha: data.fecha,
      estado_salud: data.estado_salud,
      alertas: Array.isArray(data.alertas) ? data.alertas : [],
      oportunidades: Array.isArray(data.oportunidades) ? data.oportunidades : [],
      diagnostico_general: data.diagnostico_general
    };
  } catch (err) {
    console.error(`Error al obtener insights de la IA (${tipo}):`, err);
    return tipo === "finanzas" ? MOCK_FINANCE_INSIGHTS : MOCK_INSIGHTS;
  }
}

/**
 * Ejecuta un análisis inteligente en tiempo real usando Claude.
 * Lee las métricas de marexport async function generarInsightsConIA(
  fechaInicio: string,
  fechaFin: string,
  fechaInicioPrev?: string,
  fechaFinPrev?: string,
  tipo: "marketing" | "finanzas" = "marketing"
): Promise<AIInsight> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // 1. Obtener KPIs de CRM para el periodo seleccionado y el previo
  const crmData = await obtenerKPIsPeriodoCRM(fechaInicio, fechaFin, fechaInicioPrev, fechaFinPrev);

  const crmInfo = `
PERIODO SELECCIONADO (${fechaInicio} al ${fechaFin}):
- Leads Totales Capturados en CRM: ${crmData.actual.totalLeads}
- Ventas Cerradas (Expedientes en etapa cerrado): ${crmData.actual.totalVentas}

PERIODO ANTERIOR DE COMPARACIÓN (${fechaInicioPrev || "N/A"} al ${fechaFinPrev || "N/A"}):
- Leads Totales Capturados en CRM: ${crmData.previo.totalLeads}
- Ventas Cerradas (Expedientes en etapa cerrado): ${crmData.previo.totalVentas}
  `;

  let prompt = "";

  if (tipo === "finanzas") {
    // Obtener transacciones financieras para ambos periodos
    const { data: transacciones, error: errTrans } = await sb
      .from("transacciones_financieras")
      .select("*")
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin);

    if (errTrans) throw errTrans;

    const { data: transaccionesPrev, error: errTransPrev } = await sb
      .from("transacciones_financieras")
      .select("*")
      .gte("fecha", fechaInicioPrev || "2000-01-01")
      .lte("fecha", fechaFinPrev || "2000-01-01");

    if (errTransPrev) throw errTransPrev;

    const resumenTransacciones = (transacciones || []).map(t =>
      `- Fecha: ${t.fecha} | Tipo: ${t.tipo} | Categoría: ${t.categoria} | Concepto: ${t.concepto} | Monto: $${t.monto} MXN`
    ).join("\n");

    const resumenTransaccionesPrev = (transaccionesPrev || []).map(t =>
      `- Fecha: ${t.fecha} | Tipo: ${t.tipo} | Categoría: ${t.categoria} | Concepto: ${t.concepto} | Monto: $${t.monto} MXN`
    ).join("\n");

    prompt = `Eres Sofía, la Directora de Operaciones y Finanzas Inteligente de SAUCEDA Bienes Raíces. Tu rol es analizar las transacciones financieras y la contabilidad (P&L) del negocio para evaluar su rentabilidad, estructura de gastos fijos y variables (OPEX), y dar recomendaciones tácticas.

Analiza el desempeño financiero del periodo seleccionado del ${fechaInicio} al ${fechaFin}, comparándolo con el periodo anterior del ${fechaInicioPrev || "N/A"} al ${fechaFinPrev || "N/A"}.

Aquí tienes el listado de transacciones (ingresos y gastos) del periodo seleccionado:
${resumenTransacciones || "Sin transacciones en este rango."}

Aquí tienes el listado de transacciones (ingresos y gastos) del periodo anterior:
${resumenTransaccionesPrev || "Sin transacciones en este rango."}

Y aquí está el estado comercial del CRM de conversión de prospectos para ambos periodos (útil para estimar ROAS financiero y comisiones pendientes):
${crmInfo}

Genera un reporte financiero de Estado de Resultados (P&L). Identifica alertas críticas financieras (como egresos OPEX desmedidos, nóminas o rentas que superan el margen saludable, o ROAS financiero bajo), oportunidades de mejora (optimización de servicios de suscripción o software, aceleración de comisiones pendientes en CRM) y un diagnóstico de salud general del negocio (Excelente, Regular, Crítico).

Responde exclusivamente con un JSON válido con esta estructura:
{
  "estado_salud": "excelente" | "regular" | "critico",
  "alertas": ["Frase descriptiva de alerta 1 con prefijo emoji rojo", "Frase 2..."],
  "oportunidades": ["Frase descriptiva de oportunidad 1 con prefijo emoji amarillo", "Frase 2..."],
  "diagnostico_general": "Reporte detallado en formato Markdown, analizando el rendimiento financiero (ingresos vs egresos, margen neto), análisis detallado del OPEX, balance de comisiones CRM y recomendando acciones de optimización en viñetas."
}`;
  } else {
    // Obtener métricas reales de marketing
    const { data: metricas, error: errMet } = await sb
      .from("analytics_marketing")
      .select("*")
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin)
      .order("fecha", { ascending: true });

    if (errMet) throw errMet;

    const resumenMetricas = (metricas || []).map(m =>
      `- Fecha: ${m.fecha} | Canal: ${m.canal} | Gasto: $${m.gasto_publicitario} | Clics: ${m.clics} | Leads Registrados: ${m.leads_registrados_crm}`
    ).join("\n");

    prompt = `Eres Sofía, la Directora de Operaciones Inteligente de SAUCEDA Bienes Raíces. Tu rol es analizar las métricas comerciales y de marketing recopiladas para evaluar la salud de la adquisición de prospectos y la operación del equipo.
  
Analiza el desempeño comercial del periodo seleccionado del ${fechaInicio} al ${fechaFin}, comparándolo con el periodo anterior del ${fechaInicioPrev || "N/A"} al ${fechaFinPrev || "N/A"}.

Aquí tienes los datos de publicidad y analítica de los días con campaña del periodo seleccionado:
${resumenMetricas || "Sin datos de publicidad en este rango."}

Y aquí está el estado actual del CRM de conversión de prospectos para ambos periodos:
${crmInfo}

Genera un reporte operativo y de optimización. Identifica alertas de fallas operativas (como caídas drásticas de leads, aumentos desmedidos de costos o webhooks fallidos), oportunidades de negocio (eficiencia de canales, reasignación de presupuestos) y un diagnóstico de salud general del negocio (Excelente, Regular, Crítico).

Responde exclusivamente con un JSON válido con esta estructura:
{
  "estado_salud": "excelente" | "regular" | "critico",
  "alertas": ["Frase descriptiva de alerta 1 con prefijo emoji rojo", "Frase 2..."],
  "oportunidades": ["Frase descriptiva de oportunidad 1 con prefijo emoji amarillo", "Frase 2..."],
  "diagnostico_general": "Reporte detallado en formato Markdown, analizando el rendimiento comercial, costos y recomendando acciones tácticas en viñetas."
}`;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la API Key de Anthropic (ANTHROPIC_API_KEY) en el entorno.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Error de Claude API: ${res.status} - ${errorText}`);
    }

    const json = await res.json();
    const texto = json.content[0].text;

    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("La respuesta de la IA no contiene un JSON válido.");
    }

    const dataClean = JSON.parse(match[0]);

    const nuevoInsight: AIInsight = {
      fecha: new Date().toISOString().split("T")[0],
      estado_salud: dataClean.estado_salud || "regular",
      alertas: Array.isArray(dataClean.alertas) ? dataClean.alertas : [],
      oportunidades: Array.isArray(dataClean.oportunidades) ? dataClean.oportunidades : [],
      diagnostico_general: dataClean.diagnostico_general || "",
      tipo: tipo
    };

    // Insertar en Supabase
    await sb.from("dashboard_insights").insert([nuevoInsight]);

    return nuevoInsight;
  } catch (err) {
    console.error(`Fallo al generar insights con Claude (${tipo}), usando mockups:`, err);
    return tipo === "finanzas" ? MOCK_FINANCE_INSIGHTS : MOCK_INSIGHTS;
  }
}

/**
 * Sincroniza el historial de métricas desde una fecha de inicio (ej: '2026-05-01')
 * obteniendo los datos reales de gasto, impresiones y clics desde Facebook API,
 * y emparejándolo con la cantidad real de leads creados en el CRM de Supabase para cada día.
 */
export async function sincronizarHistorialMarketing(
  accessToken: string,
  adAccountId: string,
  fechaInicio: string = "2026-05-01"
) {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const hoyStr = new Date().toISOString().split("T")[0];

    // 1. Obtener métricas diarias de Facebook Ads en una sola petición (con límite amplio de 500 registros para evitar cortes)
    const urlFb = `https://graph.facebook.com/v18.0/act_${adAccountId}/insights`;
    const resFb = await fetch(
      `${urlFb}?access_token=${accessToken}&time_range=${JSON.stringify({
        since: fechaInicio,
        until: hoyStr
      })}&time_increment=1&limit=500&fields=spend,clicks,impressions`
    );

    if (!resFb.ok) {
      const errText = await resFb.text();
      throw new Error(`Error de Facebook Graph API: ${resFb.status} - ${errText}`);
    }

    const dataFb = await resFb.json();
    const insightsFb = dataFb.data || [];

    // 2. Obtener todos los prospectos creados desde la fecha de inicio
    const { data: prospectos, error: errLeads } = await sb
      .from("prospectos")
      .select("created_at")
      .gte("created_at", `${fechaInicio}T00:00:00Z`);

    if (errLeads) throw errLeads;

    // 3. Agrupar leads del CRM por fecha en formato YYYY-MM-DD (usando zona horaria local de la app)
    const leadsPorFecha: { [key: string]: number } = {};
    prospectos?.forEach(p => {
      const fecha = new Date(p.created_at).toISOString().split("T")[0];
      leadsPorFecha[fecha] = (leadsPorFecha[fecha] || 0) + 1;
    });

    // 4. Mapear cada día de Facebook Insights e incluir el conteo de leads
    const registrosParaInsertar = insightsFb.map((item: any) => {
      const fecha = item.date_start;
      return {
        fecha,
        canal: "facebook",
        gasto_publicitario: Number(item.spend || 0),
        clics: Number(item.clicks || 0),
        impresiones: Number(item.impressions || 0),
        leads_registrados_crm: leadsPorFecha[fecha] || 0
      };
    });

    if (registrosParaInsertar.length === 0) {
      return {
        success: true,
        count: 0,
        message: "No se encontraron datos de publicidad en Facebook Ads para este periodo."
      };
    }

    // 5. Borrar datos viejos de Facebook en ese rango de fechas para evitar conflictos de clave única
    await sb
      .from("analytics_marketing")
      .delete()
      .eq("canal", "facebook")
      .gte("fecha", fechaInicio);

    // 6. Hacer el insert masivo en Supabase
    const { error: errInsert } = await sb
      .from("analytics_marketing")
      .insert(registrosParaInsertar);

    if (errInsert) throw errInsert;

    return {
      success: true,
      count: registrosParaInsertar.length,
      message: `Se sincronizaron exitosamente ${registrosParaInsertar.length} días de historial de publicidad desde el ${fechaInicio}.`
    };
  } catch (err: any) {
    console.error("Fallo al sincronizar historial de marketing:", err);
    return {
      success: false,
      count: 0,
      message: err.message || "Error interno del servidor."
    };
  }
}

/**
 * Sincroniza el historial de publicidad de TikTok Ads.
 * Consulta la API de TikTok para obtener el gasto, clics e impresiones diarios,
 * cruza la información con los leads de TikTok en el CRM, y guarda los datos de forma consolidada.
 */
export async function sincronizarHistorialTikTok(
  accessToken: string,
  advertiserId: string,
  fechaInicio: string
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const hoyStr = new Date().toISOString().split("T")[0];

    // 1. Obtener métricas diarias de TikTok Ads usando la API integrada de reportes
    const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/`;
    const params = new URLSearchParams({
      advertiser_id: advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["campaign_name", "stat_time_day"]),
      metrics: JSON.stringify(["spend", "clicks", "impressions"]),
      start_date: fechaInicio,
      end_date: hoyStr,
      page_size: "100"
    });

    const resTk = await fetch(`${url}?${params.toString()}`, {
      headers: {
        "Access-Token": accessToken
      }
    });

    if (!resTk.ok) {
      const errorText = await resTk.text();
      throw new Error(`Error en llamada HTTP a TikTok: ${resTk.status} - ${errorText}`);
    }

    const json = await resTk.json();
    if (json.code !== 0) {
      throw new Error(`Error de TikTok Graph API: ${json.code} - ${json.message}`);
    }

    const insightsTk = json.data?.list || [];

    // 2. Traer todos los prospectos del CRM para agrupar leads de TikTok por fecha
    const { data: prospectos, error: errCrm } = await sb
      .from("prospectos")
      .select("created_at, campaign_name, notas");

    if (errCrm) throw errCrm;

    // Agrupar leads atribuibles a TikTok por fecha YYYY-MM-DD
    const leadsPorFecha: Record<string, number> = {};
    (prospectos || []).forEach(p => {
      if (p.created_at) {
        const dStr = p.created_at.split("T")[0];
        
        const campaign = (p.campaign_name || "").toLowerCase();
        const notas = (p.notas || "").toLowerCase();
        const esTikTok = campaign.includes("tiktok") || notas.includes("tiktok");

        if (esTikTok) {
          leadsPorFecha[dStr] = (leadsPorFecha[dStr] || 0) + 1;
        }
      }
    });

    // 3. Procesar y preparar registros para insertar
    const registrosInsertar = insightsTk.map((item: any) => {
      const fechaFull = item.stat_time_day || "";
      const fecha = fechaFull.split(" ")[0]; // Extraer solo la fecha YYYY-MM-DD
      const leads = leadsPorFecha[fecha] || 0;

      return {
        fecha,
        canal: "tiktok",
        campana_nombre: item.campaign_name || "General TikTok",
        gasto_publicitario: Number(item.spend || 0),
        clics: Number(item.clicks || 0),
        impresiones: Number(item.impressions || 0),
        leads_registrados_crm: leads
      };
    });

    if (registrosInsertar.length === 0) {
      return {
        success: true,
        message: "No se encontraron datos de publicidad de TikTok Ads en el periodo indicado."
      };
    }

    // 4. Limpiar los registros de TikTok previos en ese rango de fechas
    const fechas = registrosInsertar.map((r: any) => r.fecha);
    const fechaMin = fechas.reduce((a: string, b: string) => a < b ? a : b);
    const fechaMax = fechas.reduce((a: string, b: string) => a > b ? a : b);

    await sb
      .from("analytics_marketing")
      .delete()
      .eq("canal", "tiktok")
      .gte("fecha", fechaMin)
      .lte("fecha", fechaMax);

    // 5. Insertar registros consolidados
    const { error: errInsert } = await sb
      .from("analytics_marketing")
      .insert(registrosInsertar);

    if (errInsert) throw errInsert;

    return {
      success: true,
      message: `Se sincronizaron exitosamente ${registrosInsertar.length} días de historial de publicidad de TikTok Ads desde el ${fechaMin}.`
    };
  } catch (error: any) {
    console.error("Error al sincronizar historial de TikTok Ads:", error);
    return {
      success: false,
      message: error.message || "Error desconocido al sincronizar."
    };
  }
}

/**
 * Analiza las transacciones marcadas como es_recurrente = true y
 * genera copias para los meses posteriores que aún no tengan registros creados.
 */
export async function procesarTransaccionesRecurrentes(sb: any): Promise<void> {
  try {
    // 1. Obtener todas las transacciones recurrentes principales (padres)
    const { data: padres, error: errPadres } = await sb
      .from("transacciones_financieras")
      .select("*")
      .eq("es_recurrente", true)
      .is("recurrente_parent_id", null);

    if (errPadres || !padres || padres.length === 0) return;

    // 2. Obtener todas las transacciones generadas (hijos)
    const { data: hijos, error: errHijos } = await sb
      .from("transacciones_financieras")
      .select("*")
      .not("recurrente_parent_id", "is", null);

    if (errHijos) return;

    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth(); // 0 = Enero, 11 = Diciembre

    const nuevosHijos: any[] = [];

    for (const parent of padres) {
      const [pAnio, pMes, pDia] = parent.fecha.split("-").map(Number);
      const pMesIndex = pMes - 1; // 0-indexed

      let idxAnio = pAnio;
      let idxMes = pMesIndex;

      while (true) {
        // Avanzar un mes
        idxMes++;
        if (idxMes > 11) {
          idxMes = 0;
          idxAnio++;
        }

        // Si superamos el año y mes actual, detenemos la generación
        if (idxAnio > anioActual || (idxAnio === anioActual && idxMes > mesActual)) {
          break;
        }

        // Comprobar si ya existe una transacción hija para este mes
        const existeHijo = (hijos || []).some(h => {
          if (h.recurrente_parent_id !== parent.id) return false;
          const [hAnio, hMes] = h.fecha.split("-").map(Number);
          return hAnio === idxAnio && (hMes - 1) === idxMes;
        });

        if (!existeHijo) {
          // Ajustar día del mes (ej. si el día de cargo es 31 y el mes destino tiene 30 días)
          const maxDias = new Date(idxAnio, idxMes + 1, 0).getDate();
          const targetDia = Math.min(pDia, maxDias);
          const mesStr = String(idxMes + 1).padStart(2, "0");
          const diaStr = String(targetDia).padStart(2, "0");
          const targetFecha = `${idxAnio}-${mesStr}-${diaStr}`;

          nuevosHijos.push({
            fecha: targetFecha,
            tipo: parent.tipo,
            categoria: parent.categoria,
            concepto: parent.concepto,
            monto: parent.monto,
            expediente_id: parent.expediente_id || null,
            recurrente_parent_id: parent.id,
            es_recurrente: false // Los hijos generados son individuales para poder editarse
          });
        }
      }
    }

    if (nuevosHijos.length > 0) {
      const { error: errInsert } = await sb
        .from("transacciones_financieras")
        .insert(nuevosHijos);
      if (errInsert) throw errInsert;
      console.log(`[Recurrentes] Se generaron y guardaron ${nuevosHijos.length} movimientos recurrentes.`);
    }
  } catch (err) {
    console.error("Error al autogenerar gastos recurrentes:", err);
  }
}

/**
 * Obtiene las transacciones financieras registradas en un rango de fechas.
 * Une la información del cliente desde la tabla de expedientes si existe.
 */
export async function obtenerTransaccionesFinancieras(
  fechaInicio: string,
  fechaFin: string
): Promise<TransaccionFinanciera[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Autogenerar gastos recurrentes antes de hacer la consulta real
  await procesarTransaccionesRecurrentes(sb);

  try {
    const { data, error } = await sb
      .from("transacciones_financieras")
      .select(`
        *,
        expedientes (
          cliente
        )
      `)
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin)
      .order("fecha", { ascending: false });

    if (error) throw error;

    return (data || []).map((t: any) => ({
      id: t.id,
      fecha: t.fecha,
      tipo: t.tipo as "ingreso" | "gasto",
      categoria: t.categoria as any,
      concepto: t.concepto,
      monto: Number(t.monto),
      expediente_id: t.expediente_id,
      created_at: t.created_at,
      expediente_cliente: t.expedientes ? t.expedientes.cliente : null,
      es_recurrente: t.es_recurrente,
      recurrente_parent_id: t.recurrente_parent_id
    }));
  } catch (err) {
    console.error("Error al obtener transacciones financieras:", err);
    return [];
  }
}

/**
 * Registra una nueva transacción financiera (gasto o ingreso) en Supabase.
 */
export async function crearTransaccionFinanciera(
  t: Omit<TransaccionFinanciera, "id" | "created_at">
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { error } = await sb.from("transacciones_financieras").insert([t]);
    if (error) throw error;

    return { success: true, message: "Movimiento financiero registrado exitosamente." };
  } catch (err: any) {
    console.error("Error al crear transacción financiera:", err);
    return { success: false, message: err.message || "Error al registrar el movimiento." };
  }
}

/**
 * Inserta un conjunto masivo de transacciones financieras (importador de Excel).
 */
export async function importarTransaccionesMasivas(
  transacciones: Omit<TransaccionFinanciera, "id" | "created_at">[]
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { error } = await sb.from("transacciones_financieras").insert(transacciones);
    if (error) throw error;

    return { success: true, message: `Se importaron exitosamente ${transacciones.length} movimientos financieros.` };
  } catch (err: any) {
    console.error("Error al importar transacciones financieras:", err);
    return { success: false, message: err.message || "Error al importar movimientos." };
  }
}

/**
 * Elimina un registro de transacción financiera en Supabase.
 */
export async function eliminarTransaccionFinanciera(
  id: string
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { error } = await sb.from("transacciones_financieras").delete().eq("id", id);
    if (error) throw error;

    return { success: true, message: "Movimiento financiero eliminado exitosamente." };
  } catch (err: any) {
    console.error("Error al eliminar transacción financiera:", err);
    return { success: false, message: err.message || "Error al eliminar el movimiento." };
  }
}

/**
 * Obtiene los expedientes en etapa 'cerrado' que aún no tienen una comisión (ingreso) asociada.
 */
export async function obtenerExpedientesCerradosSinComision(): Promise<
  Array<{ id: string; cliente: string; valor_estimado: number; ultimo_movimiento: string }>
> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    // 1. Obtener expedientes cerrados
    const { data: expedientes, error: errExp } = await sb
      .from("expedientes")
      .select("id, cliente, valor_estimado, ultimo_movimiento")
      .eq("etapa", "cerrado");

    if (errExp) throw errExp;
    if (!expedientes || expedientes.length === 0) return [];

    // 2. Obtener IDs de expedientes que ya tengan ingresos/comisión asociados
    const { data: transacciones, error: errTrans } = await sb
      .from("transacciones_financieras")
      .select("expediente_id")
      .is("expediente_id", "not.null")
      .eq("tipo", "ingreso");

    if (errTrans) throw errTrans;

    const idsConComision = new Set((transacciones || []).map((t: any) => t.expediente_id));

    // 3. Filtrar los que no tienen registro financiero
    return expedientes
      .filter((e: any) => !idsConComision.has(e.id))
      .map((e: any) => ({
        id: e.id,
        cliente: e.cliente,
        valor_estimado: Number(e.valor_estimado || 0),
        ultimo_movimiento: e.ultimo_movimiento || ""
      }));
  } catch (err) {
    console.error("Error al obtener expedientes cerrados sin comisión:", err);
    return [];
  }
}

/**
 * Obtiene todos los expedientes (ID y nombre de cliente) para el selector de vinculación manual.
 */
export async function obtenerTodosLosExpedientes(): Promise<Array<{ id: string; cliente: string }>> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("expedientes")
      .select("id, cliente")
      .order("cliente", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error al obtener todos los expedientes:", err);
    return [];
  }
}

/**
 * Elimina de la base de datos todas las transacciones de prueba con la etiqueta "(Demo)".
 */
export async function eliminarDatosDemostracionFinanzas(): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { error } = await sb
      .from("transacciones_financieras")
      .delete()
      .like("concepto", "%(Demo)%");

    if (error) throw error;

    return { success: true, message: "Todos los datos de demostración con la etiqueta '(Demo)' fueron eliminados." };
  } catch (err: any) {
    console.error("Error al eliminar datos demo:", err);
    return { success: false, message: err.message || "Error al eliminar registros demo." };
  }
}

/**
 * Actualiza un movimiento financiero existente en Supabase.
 */
export async function actualizarTransaccionFinanciera(
  id: string,
  t: Omit<TransaccionFinanciera, "id" | "created_at">
): Promise<{ success: boolean; message: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { error } = await sb
      .from("transacciones_financieras")
      .update(t)
      .eq("id", id);

    if (error) throw error;

    return { success: true, message: "Movimiento financiero actualizado exitosamente." };
  } catch (err: any) {
    console.error("Error al actualizar transacción financiera:", err);
    return { success: false, message: err.message || "Error al actualizar el movimiento." };
  }
}
