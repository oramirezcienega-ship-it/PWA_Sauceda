"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";

export interface AnalisisIA {
  telefono: string;
  resumen: string;
  punto_de_quiebre: string;
  razon_perdida: string;
  calidad_lead: "alta" | "media" | "baja";
  recomendacion: string;
  recuperable: boolean;
  created_at: string;
}

/**
 * Obtiene todos los análisis de IA cacheados en la base de datos.
 * Maneja el error de forma silenciosa si la tabla aún no existe.
 */
export async function obtenerTodosLosAnalisis(): Promise<AnalisisIA[]> {
  try {
    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("analisis_ia")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      // Si la tabla no existe en Supabase, no queremos tronar el dashboard
      if (error.code === "42P01") {
        console.warn("La tabla analisis_ia no existe en Supabase. Corre la migración 0017_analisis_ia.sql");
        return [];
      }
      throw error;
    }

    return (data as AnalisisIA[]) ?? [];
  } catch (err) {
    console.error("Error al obtener análisis de IA:", err);
    return [];
  }
}

/**
 * Analiza un hilo de conversación utilizando Claude (Anthropic) y guarda
 * el resultado en caché dentro de Supabase.
 */
export async function analizarConversacionConIA(telefono: string): Promise<AnalisisIA> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener mensajes para este teléfono
  let mensajes: Array<{ role: "user" | "assistant"; text: string; created_at: string }> = [];

  try {
    // Intentar esquema estándar
    const { data: lead } = await sb
      .from("leads")
      .select("id")
      .eq("phone", telefono)
      .maybeSingle();

    if (lead) {
      const { data: conv } = await sb
        .from("conversations")
        .select("id")
        .eq("lead_id", lead.id)
        .maybeSingle();

      if (conv) {
        const { data: msgs } = await sb
          .from("messages")
          .select("role, text, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true });

        mensajes = (msgs as any[]) ?? [];
      }
    }
  } catch {
    // Si falla, se asume esquema fallback
  }

  // Fallback si no hay mensajes en esquema estándar
  if (mensajes.length === 0) {
    const { data: msgs } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, created_at")
      .eq("telefono", telefono)
      .order("created_at", { ascending: true });

    mensajes = (msgs ?? []).map((m) => ({
      role: m.direccion === "in" ? "user" : "assistant",
      text: m.texto || "",
      created_at: m.created_at
    }));
  }

  if (mensajes.length === 0) {
    throw new Error("No hay mensajes en esta conversación para analizar.");
  }

  // 2. Formatear la conversación para el prompt de Claude
  const conversacionFormateada = mensajes
    .map((m) => {
      const remitente = m.role === "user" ? "Cliente" : "Sofía (IA)";
      return `${remitente} [${new Date(m.created_at).toLocaleString()}]: ${m.text}`;
    })
    .join("\n\n");

  // 3. Consultar la API de Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la API Key de Anthropic (ANTHROPIC_API_KEY) en las variables de entorno.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const prompt = `Eres un analista de ventas para SAUCEDA Bienes Raíces, especialistas en traspasos INFONAVIT en León, Guanajuato.

Analiza esta conversación entre Sofía (agente IA) y un lead:

${conversacionFormateada}

Responde EXCLUSIVAMENTE con un objeto JSON válido. No incluyas explicaciones antes ni después del JSON. El formato debe ser exactamente:
{
  "resumen": "2 líneas de qué pasó",
  "punto_de_quiebre": "en qué momento o mensaje se perdió el lead",
  "razon_perdida": "por qué no avanzó",
  "calidad_lead": "alta / media / baja",
  "recomendacion": "qué debería haber dicho Sofía diferente",
  "recuperable": true
}`;

  console.log(`Invocando Claude (${model}) para analizar conversación del teléfono ${telefono}...`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Error de Anthropic API:", response.status, errorText);
    throw new Error(`Anthropic respondió error ${response.status}: ${errorText}`);
  }

  const resultJson = await response.json();
  const rawText = (resultJson.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text ?? "")
    .join("")
    .trim();

  // Limpiar markdown del JSON si es necesario
  let JSONLimpio = rawText;
  if (JSONLimpio.startsWith("```")) {
    JSONLimpio = JSONLimpio.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  JSONLimpio = JSONLimpio.trim();

  // Si no empieza con {, extraer el bloque JSON
  if (!JSONLimpio.startsWith("{")) {
    const startIdx = JSONLimpio.indexOf("{");
    const endIdx = JSONLimpio.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      JSONLimpio = JSONLimpio.slice(startIdx, endIdx + 1);
    }
  }

  let parsedAnalysis;
  try {
    parsedAnalysis = JSON.parse(JSONLimpio);
  } catch (err) {
    console.error("Error al parsear el JSON de Claude:", JSONLimpio);
    throw new Error("No se pudo obtener un JSON válido desde la API de Claude.");
  }

  // 4. Validar y normalizar campos obligatorios
  const analisis: Omit<AnalisisIA, "created_at"> = {
    telefono,
    resumen: parsedAnalysis.resumen || "Sin resumen disponible.",
    punto_de_quiebre: parsedAnalysis.punto_de_quiebre || "No determinado.",
    razon_perdida: parsedAnalysis.razon_perdida || "No especificada.",
    calidad_lead: (parsedAnalysis.calidad_lead === "alta" || parsedAnalysis.calidad_lead === "media" || parsedAnalysis.calidad_lead === "baja")
      ? parsedAnalysis.calidad_lead
      : "media",
    recomendacion: parsedAnalysis.recomendacion || "Sin recomendaciones.",
    recuperable: !!parsedAnalysis.recuperable
  };

  // 5. Guardar en la base de datos (analisis_ia)
  const queryData = {
    ...analisis,
    created_at: new Date().toISOString()
  };

  const { error: dbError } = await sb
    .from("analisis_ia")
    .upsert(queryData);

  if (dbError) {
    console.error("Error al guardar en tabla analisis_ia:", dbError);
    // Continuamos a pesar del error de guardado para no romper la UX
  }

  return queryData;
}
