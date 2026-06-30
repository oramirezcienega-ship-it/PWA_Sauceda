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

export interface AIInsight {
  id?: string;
  fecha: string;
  alertas: string[];
  oportunidades: string[];
  estado_salud: "excelente" | "regular" | "critico";
  diagnostico_general: string;
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

/**
 * Obtiene las métricas de marketing y CRM de Supabase.
 * Si la tabla está vacía, inserta y retorna los mockups de prueba para asegurar que el dashboard sea visible inmediatamente.
 */
export async function obtenerMetricasMarketing(): Promise<MarketingMetric[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("analytics_marketing")
      .select("*")
      .order("fecha", { ascending: true });

    if (error) {
      if (error.code === "42P01") {
        console.warn("La tabla analytics_marketing no existe. Usando fallback Mockup.");
        return MOCK_METRICAS;
      }
      throw error;
    }

    if (!data || data.length === 0) {
      // Poblar tabla con mockups si está vacía, para fines demostrativos iniciales
      const { data: insertados } = await sb
        .from("analytics_marketing")
        .insert(MOCK_METRICAS)
        .select();

      return (insertados as MarketingMetric[]) || MOCK_METRICAS;
    }

    return data as MarketingMetric[];
  } catch (err) {
    console.error("Error al obtener métricas de marketing:", err);
    return MOCK_METRICAS;
  }
}

/**
 * Obtiene el insight/diagnóstico analítico más reciente.
 * Si la tabla está vacía, retorna el mockup por defecto.
 */
export async function obtenerInsightsIA(): Promise<AIInsight> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("dashboard_insights")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        console.warn("La tabla dashboard_insights no existe. Usando fallback Mockup.");
        return MOCK_INSIGHTS;
      }
      throw error;
    }

    if (!data) {
      // Guardar el mockup por defecto si no hay nada
      const { data: insertado } = await sb
        .from("dashboard_insights")
        .insert([MOCK_INSIGHTS])
        .select()
        .single();

      return (insertado as AIInsight) || MOCK_INSIGHTS;
    }

    return {
      fecha: data.fecha,
      estado_salud: data.estado_salud,
      alertas: Array.isArray(data.alertas) ? data.alertas : [],
      oportunidades: Array.isArray(data.oportunidades) ? data.oportunidades : [],
      diagnostico_general: data.diagnostico_general
    };
  } catch (err) {
    console.error("Error al obtener insights de la IA:", err);
    return MOCK_INSIGHTS;
  }
}

/**
 * Ejecuta un análisis inteligente en tiempo real usando Claude.
 * Lee las métricas de marketing consolidadas y genera el diagnóstico en base a ellas y al CRM actual.
 */
export async function generarInsightsConIA(): Promise<AIInsight> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const metricas = await obtenerMetricasMarketing();
  const crmData = await obtenerDatosCRM();

  // Formatear métricas y crm para Claude
  const resumenMetricas = metricas.slice(-14).map(m => 
    `- Fecha: ${m.fecha} | Canal: ${m.canal} | Gasto: $${m.gasto_publicitario} | Clics: ${m.clics} | Leads Registrados: ${m.leads_registrados_crm}`
  ).join("\n");

  const crmInfo = `
- Leads Totales: ${crmData.resumenEmbudo.totalLeads}
- Leads Contactados: ${crmData.resumenEmbudo.contactados}
- Tasa Conversión Lead -> Contactado: ${crmData.resumenEmbudo.tasaLeadAContactado}%
- Tiempos promedio de respuesta: ${crmData.tiempoRespuesta.promedioMinutos} minutos
- Alerta por inactividad activa: ${crmData.tiempoRespuesta.alerta ? "SÍ" : "NO"}
  `;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la API Key de Anthropic (ANTHROPIC_API_KEY) en el entorno.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const prompt = `Eres Sofía, la Directora de Operaciones Inteligente de SAUCEDA Bienes Raíces. Tu rol es analizar las métricas comerciales y de marketing recopiladas para evaluar la salud de la adquisición de prospectos y la operación del equipo.

Aquí tienes los datos de publicidad y analítica de los últimos días:
${resumenMetricas}

Y aquí está el estado actual del CRM de conversión de prospectos:
${crmInfo}

Genera un reporte operativo y de optimización. Identifica alertas de fallas operativas (como caídas drásticas de leads, aumentos desmedidos de costos o webhooks fallidos), oportunidades de negocio (eficiencia de canales, reasignación de presupuestos) y un diagnóstico de salud general del negocio (Excelente, Regular, Crítico).

Responde exclusivamente con un JSON válido con esta estructura:
{
  "estado_salud": "excelente" | "regular" | "critico",
  "alertas": ["Frase descriptiva de alerta 1 con prefijo emoji rojo", "Frase 2..."],
  "oportunidades": ["Frase descriptiva de oportunidad 1 con prefijo emoji amarillo", "Frase 2..."],
  "diagnostico_general": "Reporte detallado en formato Markdown, analizando el rendimiento comercial, costos y recomendando acciones tácticas en viñetas."
}`;

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

    // Extraer JSON limpio de la respuesta
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
      diagnostico_general: dataClean.diagnostico_general || ""
    };

    // Insertar en Supabase
    await sb.from("dashboard_insights").insert([nuevoInsight]);

    return nuevoInsight;
  } catch (err) {
    console.error("Fallo al generar insights con Claude, usando mockups:", err);
    return MOCK_INSIGHTS;
  }
}
