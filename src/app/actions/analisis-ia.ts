"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { variantesTelefono, normalizarTelefono } from "@/lib/telefono";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";

export interface AnalisisIA {
  telefono: string;
  resumen: string;
  punto_de_quiebre: string;
  razon_perdida: string;
  calidad_lead: "alta" | "media" | "baja";
  recomendacion: string;
  recuperable: boolean;
  mejora_aplicada?: boolean;
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
export async function analizarConversacionConIA(telefono: string, prospectoId?: string): Promise<AnalisisIA> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener mensajes para este teléfono considerando variantes
  let mensajes: Array<{ role: "user" | "assistant"; text: string; created_at: string }> = [];
  const variantes = variantesTelefono(telefono);

  // Buscar prospecto y expediente asociados para obtener IDs y hacer búsquedas cruzadas robustas
  let prospectoIdResuelto = prospectoId || "";
  let expedienteIdResuelto = "";

  if (prospectoIdResuelto) {
    try {
      const { data: exp } = await sb
        .from("expedientes")
        .select("id")
        .eq("prospecto_id", prospectoIdResuelto)
        .maybeSingle();
      if (exp) {
        expedienteIdResuelto = exp.id;
      }
    } catch (expErr) {
      console.error("Error al buscar expediente por prospectoId:", expErr);
    }
  } else {
    // Si no se proporcionó prospectoId, intentar buscar en memoria usando el teléfono
    try {
      const { data: todosProspectos } = await sb
        .from("prospectos")
        .select("id, telefono, nombre");

      const telCanon = normalizarTelefono(telefono);
      const diezDigitosTarget = telCanon.slice(-10);

      const prospectoCoincidente = (todosProspectos ?? []).find((p) => {
        if (!p.telefono) return false;
        const pCanon = normalizarTelefono(p.telefono);
        const pDiez = pCanon.slice(-10);
        return pDiez === diezDigitosTarget;
      });
      
      if (prospectoCoincidente) {
        prospectoIdResuelto = prospectoCoincidente.id;
        const { data: exp } = await sb
          .from("expedientes")
          .select("id")
          .eq("prospecto_id", prospectoCoincidente.id)
          .maybeSingle();
        if (exp) {
          expedienteIdResuelto = exp.id;
        }
      }
    } catch (err) {
      console.error("Error al buscar prospecto en memoria:", err);
    }
  }

  try {
    // Intentar esquema estándar
    const { data: lead } = await sb
      .from("leads")
      .select("id")
      .in("phone", variantes)
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
    const filtrosOr = [];
    if (telefono) {
      filtrosOr.push(`telefono.in.(${variantes.map(v => `"${v}"`).join(",")})`);
    }
    if (prospectoIdResuelto) {
      filtrosOr.push(`prospecto_id.eq.${prospectoIdResuelto}`);
    }
    if (expedienteIdResuelto) {
      filtrosOr.push(`expediente_id.eq.${expedienteIdResuelto}`);
    }

    const { data: msgs } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, created_at")
      .or(filtrosOr.join(","))
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
    telefono: telefono || prospectoIdResuelto,
    resumen: parsedAnalysis.resumen || "Sin resumen disponible.",
    punto_de_quiebre: parsedAnalysis.punto_de_quiebre || "No determinado.",
    razon_perdida: parsedAnalysis.razon_perdida || "No especificada.",
    calidad_lead: (parsedAnalysis.calidad_lead === "alta" || parsedAnalysis.calidad_lead === "media" || parsedAnalysis.calidad_lead === "baja")
      ? parsedAnalysis.calidad_lead
      : "media",
    recomendacion: parsedAnalysis.recomendacion || "Sin recomendaciones.",
    recuperable: !!parsedAnalysis.recuperable,
    mejora_aplicada: false
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

/**
 * Obtiene el valor de una clave de configuración del agente en la base de datos.
 */
export async function obtenerConfiguracionAgente(clave: string): Promise<string> {
  try {
    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("configuracion_agente")
      .select("valor")
      .eq("clave", clave)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        // La tabla no existe aún, retornar vacío
        return "";
      }
      throw error;
    }
    return data?.valor || "";
  } catch (err) {
    console.error(`Error al obtener configuración para clave ${clave}:`, err);
    return "";
  }
}

/**
 * Guarda o actualiza el valor de una clave de configuración en la base de datos.
 */
export async function guardarConfiguracionAgente(clave: string, valor: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  try {
    const sb = supabaseServidor();
    const { error } = await sb
      .from("configuracion_agente")
      .upsert({
        clave,
        valor,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error(`Error al guardar configuración para clave ${clave}:`, error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("Error en guardarConfiguracionAgente:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

/**
 * Genera un plan de mejora consolidado y reglas de prompt recomendadas
 * basándose en todos los análisis guardados en la base de datos.
 */
export async function generarPlanMejoraConsolidado(): Promise<{
  ok: boolean;
  reporteMarkdown?: string;
  instruccionesSugeridas?: string;
  error?: string;
}> {
  await requireAdmin();

  // 1. Obtener todos los análisis de la base de datos
  const analisisList = await obtenerTodosLosAnalisis();
  if (analisisList.length === 0) {
    return {
      ok: false,
      error: "No hay análisis de IA guardados en la base de datos para compilar. Por favor, analiza algunas conversaciones primero.",
    };
  }

  // 2. Formatear la lista de análisis para Claude
  const listadoFormateado = analisisList
    .map((a, i) => {
      return `ANÁLISIS DE LEAD #${i + 1} (Tel: ${a.telefono}):
- Calidad del lead: ${a.calidad_lead}
- Recuperable: ${a.recuperable ? "Sí" : "No"}
- Resumen: ${a.resumen}
- Razón de pérdida: ${a.razon_perdida}
- Punto de quiebre: "${a.punto_de_quiebre}"
- Recomendación dada: ${a.recomendacion}
----------------------------------------`;
    })
    .join("\n\n");

  // 3. Consultar la API de Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la API Key de Anthropic (ANTHROPIC_API_KEY) en las variables de entorno.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const prompt = `Eres un consultor experto en optimización de agentes conversacionales y prompts de sistema de IA para ventas en SAUCEDA Bienes Raíces.

SAUCEDA Bienes Raíces opera en León, Guanajuato, México, ofreciendo tres modelos de servicio:
1. Compra Directa de Casas con Adeudo o Descuido (liquidando adeudos de INFONAVIT, ISSSTE o bancos).
2. Promoción de Viviendas (venta a cambio de una comisión/fee).
3. Armado de Expediente / Trámite ante INFONAVIT.

A continuación tienes un listado de análisis de leads cuyas conversaciones se perdieron o no se calificaron adecuadamente por nuestra agente "Sofía":

${listadoFormateado}

Tu objetivo es analizar de forma transversal todos estos casos para encontrar patrones de falla, proponer soluciones de negocio e inyectar nuevas reglas precisas al comportamiento de Sofía para evitar que cometa los mismos errores y califique adecuadamente a los clientes según el servicio de su interés.

Responde con el siguiente formato estructurado usando etiquetas delimitadoras (no uses JSON, escribe directamente el texto dentro de las etiquetas):

[REPORTE_MARKDOWN]
### 📊 Diagnóstico de Pérdidas y Plan Comercial

#### 1. Patrones de Falla Comunes
(Analiza aquí de forma consolidada en español con viñetas los 2-3 motivos más recurrentes por los que se perdieron estos leads)

#### 2. Acciones de Negocio Recomendadas
(Qué deberían hacer los asesores humanos o cómo ajustar el proceso comercial para recuperar estos leads o mejorar la conversión)
[/REPORTE_MARKDOWN]

[INSTRUCCIONES_SUGERIDAS]
- Si el cliente menciona que tiene un adeudo pero no da el monto, pregúntale amablemente...
- Evita insistir con la misma pregunta si el cliente ya mostró desinterés...
(Añade aquí las reglas y directrices adicionales en español, estructuradas en viñetas claras, listas para copiar al prompt de Sofía. Máximo 15-20 líneas)
[/INSTRUCCIONES_SUGERIDAS]`;

  console.log(`Generando plan de mejora consolidado basado en ${analisisList.length} análisis usando Claude (${model})...`);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error de Anthropic API:", response.status, errorText);
      return { ok: false, error: `Anthropic respondió con error: ${response.status}` };
    }

    const resultJson = await response.json();
    const rawText = (resultJson.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text ?? "")
      .join("")
      .trim();

    const reporteMatch = rawText.match(/\[REPORTE_MARKDOWN\]([\s\S]*?)\[\/REPORTE_MARKDOWN\]/);
    const instruccionesMatch = rawText.match(/\[INSTRUCCIONES_SUGERIDAS\]([\s\S]*?)\[\/INSTRUCCIONES_SUGERIDAS\]/);

    const reporteMarkdown = (reporteMatch ? reporteMatch[1] : rawText).trim();
    const instruccionesSugeridas = (instruccionesMatch ? instruccionesMatch[1] : "").trim();

    return {
      ok: true,
      reporteMarkdown: reporteMarkdown || "Sin reporte disponible.",
      instruccionesSugeridas: instruccionesSugeridas || "Sin instrucciones sugeridas."
    };
  } catch (err) {
    console.error("Error al generar el plan de mejora con Claude:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al procesar la respuesta de la IA."
    };
  }
}

/**
 * Marca una recomendación/conversación individual como que ya se aplicó su mejora en el prompt global.
 */
export async function marcarMejoraComoAplicada(identificador: string, aplicada: boolean = true): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  try {
    const sb = supabaseServidor();
    const { error } = await sb
      .from("analisis_ia")
      .update({ mejora_aplicada: aplicada })
      .eq("telefono", identificador);

    if (error) throw error;
    return { ok: true };
  } catch (err: any) {
    console.error("Error al marcar mejora como aplicada:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Envía manualmente una plantilla de marketing por WhatsApp para reactivar a un lead inactivo
 * que está fuera de la ventana de 24 horas.
 */
export async function enviarPlantillaReactivacionManual(
  telefono: string,
  tipoNegocio: string,
  nombreCliente: string,
  expedienteId?: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  try {
    const sb = supabaseServidor();
    
    // 1. Mapear tipo de negocio a plantilla de Meta
    let plantilla = "reactivacion_impermeabilizacio"; // Fallback por defecto
    const negocioNormalizado = (tipoNegocio || "").trim();

    if (negocioNormalizado === "construccion-impermeabilizacion") {
      plantilla = "reactivacion_impermeabilizacio";
    } else if (negocioNormalizado === "traspaso_compra") {
      plantilla = "reactivacion_compra_directa";
    } else if (negocioNormalizado === "promocion_venta") {
      plantilla = "reactivacion_promocion_venta";
    } else if (negocioNormalizado === "solo_tramite") {
      plantilla = "reactivacion_solo_tramite";
    }

    // Nombre limpio del cliente para el parámetro {{1}} de la plantilla
    const primerNombre = (nombreCliente || "Cliente").split(" ")[0] || "Cliente";

    // 2. Enviar por WhatsApp
    const resWa = await enviarWhatsAppPlantilla(
      telefono,
      plantilla,
      "es_MX",
      [primerNombre]
    );

    if (!resWa.ok) {
      throw new Error(resWa.error || "Meta rechazó el envío de la plantilla.");
    }

    // 3. Registrar mensaje saliente en la BD
    // Construimos un texto descriptivo del mensaje para el historial
    let textoMensaje = `[Plantilla: ${plantilla}] Hola ${primerNombre}`;
    if (plantilla === "reactivacion_impermeabilizacio") {
      textoMensaje = `[Plantilla: reactivacion_impermeabilizacio] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Construye. 🛠️ Notamos que estabas interesado en impermeabilizar tu azotea. ¿Te gustaría que agendemos una inspección técnica gratuita y sin compromiso esta semana para darte tu presupuesto exacto?`;
    } else if (plantilla === "reactivacion_compra_directa") {
      textoMensaje = `[Plantilla: reactivacion_compra_directa] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Bienes Raíces. 🏡 ¿Tienes alguna duda sobre cómo compramos tu casa al contado y liquidamos tu adeudo (de Infonavit, banco, etc.)? Si gustas, podemos agendar una llamada breve con un asesor.`;
    } else if (plantilla === "reactivacion_promocion_venta") {
      textoMensaje = `[Plantilla: reactivacion_promocion_venta] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Bienes Raíces. 📈 ¿Te gustaría que un asesor te platique cómo te ayudamos a vender tu propiedad en León al mejor precio y de forma segura?`;
    } else if (plantilla === "reactivacion_solo_tramite") {
      textoMensaje = `[Plantilla: reactivacion_solo_tramite] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Bienes Raíces. ⚖️ ¿Pudiste revisar los requisitos para el trámite de tu crédito o propiedad? Si gustas, te apoyamos a resolver tus dudas.`;
    }

    await sb.from("mensajes_whatsapp").insert({
      telefono: normalizarTelefono(telefono),
      texto: textoMensaje,
      direccion: "out",
      expediente_id: expedienteId || null,
      estado: "enviado",
      agente: "IA (Reactivación)",
      wa_message_id: resWa.messageId || null,
    });

    // 4. Registrar actividad si hay expedienteId
    if (expedienteId) {
      await registrarActividad(sb, {
        expedienteId,
        tipo: "sistema",
        titulo: "Reactivación Manual Enviada",
        detalle: `Se envió la plantilla de marketing "${plantilla}" a ${primerNombre}.`,
      });
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Error al enviar plantilla de reactivación manual:", err);
    return { ok: false, error: err.message };
  }
}

