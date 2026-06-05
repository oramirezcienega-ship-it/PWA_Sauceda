import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { MARCA } from "@/lib/marca";

/**
 * AGENTE DE IA (Claude) para responder automáticamente las conversaciones
 * de WhatsApp dentro de la ventana de 24 h.
 *
 * Es best-effort: si no está configurado o falla, no interrumpe nada.
 * Reglas clave:
 *  - Solo responde si está activo (hay ANTHROPIC_API_KEY y IA_AGENTE != "off").
 *  - Si un humano ya respondió en el hilo (toma de control), la IA se calla.
 *  - Sus respuestas se guardan firmadas como agente "IA".
 */

const NOMBRE_AGENTE = "IA";
const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_HISTORIAL = 20;

/** ¿Está activo el agente de IA? */
export function iaAgenteActivo(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.IA_AGENTE !== "off";
}

/**
 * Diagnóstico del agente: comprueba configuración y hace un "ping" real a
 * Claude para verificar que la key, el modelo y el crédito funcionan.
 * Pensado para un botón "Probar IA" en el panel (no expone la key).
 */
export async function diagnosticoIA(): Promise<{ ok: boolean; mensaje: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      mensaje:
        "Falta ANTHROPIC_API_KEY en este deploy. Agrégala en Netlify y dispara un Trigger deploy.",
    };
  }
  if (process.env.IA_AGENTE === "off") {
    return {
      ok: false,
      mensaje: "La IA está apagada (IA_AGENTE = off). Cámbiala a 'on' y vuelve a desplegar.",
    };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.ok) {
      return { ok: true, mensaje: `IA lista ✓ — modelo ${MODELO} responde correctamente.` };
    }
    const cuerpo = (await res.text()).slice(0, 200);
    const pista =
      res.status === 401
        ? " (key inválida)"
        : res.status === 404
          ? " (modelo no encontrado: revisa ANTHROPIC_MODEL)"
          : res.status === 429
            ? " (sin crédito o límite alcanzado: activa billing en Anthropic)"
            : "";
    return { ok: false, mensaje: `Anthropic respondió ${res.status}${pista}. ${cuerpo}` };
  } catch (err) {
    return { ok: false, mensaje: `No se pudo contactar a Anthropic: ${String(err)}` };
  }
}

interface FilaMsg {
  direccion: "in" | "out";
  texto: string;
  agente: string;
  created_at: string;
}

interface FilaExp {
  cliente: string | null;
  primer_apellido: string | null;
  fraccionamiento: string | null;
  etapa: string | null;
  situacion: string | null;
}

/** Construye las instrucciones (system prompt) del asistente. */
function instrucciones(exp: FilaExp | null): string {
  const base = `Eres el asistente virtual de SAUCEDA Bienes Raíces, una inmobiliaria en León, Guanajuato, México, especializada en TRASPASOS de propiedades con crédito INFONAVIT. Tu objetivo principal es calificar al lead recopilando información clave para evaluar si podemos hacer una propuesta de compra para su propiedad.

Lleva la conversación de manera amigable, paciente y paso a paso por WhatsApp. Evita pedirles que cambien de canal o sugerir llamadas telefónicas (muchos clientes no desean llamadas y prefieren mantenerse en WhatsApp). Como ya estás hablando con ellos por WhatsApp, no les pidas su número de teléfono.

Información que debes recopilar (de forma progresiva, no de golpe, haciendo una pregunta a la vez):
1. Ubicación de la vivienda (fraccionamiento o zona en León, Gto).
2. Valor estimado o aproximado de la vivienda.
3. Cuánto adeudan actualmente de su crédito INFONAVIT (saldo aproximado de deuda).
4. Estado físico actual de la vivienda (si está en buen estado, deshabitada o vandalizada).
5. Preguntar amablemente si pueden enviarte fotos de la vivienda o si pueden compartirte su estado de cuenta de INFONAVIT por este mismo chat para afinar el análisis.

Una vez que tengas estos datos mínimos recopilados:
- Comunícales con amabilidad que con esta información nuestro equipo preparará una propuesta de compra/traspaso personalizada para que la analicen.
- Infórmales cuáles son los siguientes pasos y que les daremos respuesta directamente por este chat de WhatsApp.

Qué SÍ haces:
- Saludar y resolver dudas sobre cómo funciona un traspaso de INFONAVIT.
- Preguntar de forma fluida y natural sobre los datos de la propiedad (ubicación, adeudo, estado de la casa, valor).
- Indicar que pueden mandar fotos y estados de cuenta por aquí para que el equipo los revise.

Qué NO haces:
- NO presiones al cliente para llamarle por teléfono o agendar una llamada. Respeta su canal de WhatsApp al 100%.
- NO inventes ni prometas montos exactos de avalúos, precios de compra o tiempos definitivos.
- NO des asesoría legal ni financiera definitiva.

Estilo:
- Respuestas CORTAS (1 a 3 frases), tipo chat informal pero profesional. Emojis con moderación.
- Haz una sola pregunta a la vez para no abrumar al cliente.
- Eres un asistente virtual (no te hagas pasar por humano si te preguntan).

IMPORTANTE: Debes responder EXCLUSIVAMENTE con un objeto JSON válido. No incluyes explicaciones antes ni después del JSON. El formato debe ser exactamente:
{
  "respuesta": "El mensaje de texto corto (1 a 3 frases) que se enviará al cliente por WhatsApp.",
  "datosExtraidos": {
    "fraccionamiento": "Nombre del fraccionamiento/zona si el cliente lo mencionó claramente en la conversación, de lo contrario null",
    "valor_estimado": "Valor aproximado de la propiedad como número entero sin signos de puntuación si el cliente lo mencionó en la conversación, de lo contrario null",
    "saldo_deuda": "Monto adeudado de INFONAVIT como número entero sin signos de puntuación si el cliente lo mencionó en la conversación, de lo contrario null",
    "situacion_fisica": "El estado físico de la casa. Solo puede ser 'vandalizada', 'deshabitada' o 'bueno' si el cliente lo mencionó claramente, de lo contrario null"
  }
}

Contacto SAUCEDA: WhatsApp ${MARCA.whatsappTexto} · ${MARCA.web}`;

  const extra = (process.env.IA_INSTRUCCIONES || "").trim();
  let contexto = "";
  if (exp) {
    const nombre = [exp.cliente, exp.primer_apellido].filter(Boolean).join(" ");
    const partes = [
      nombre && `Nombre del cliente: ${nombre}`,
      exp.fraccionamiento &&
        exp.fraccionamiento !== "Por definir" &&
        `Fraccionamiento/zona: ${exp.fraccionamiento}`,
      exp.etapa && `Etapa del trámite: ${exp.etapa}`,
    ].filter(Boolean);
    if (partes.length) contexto = `\n\nDatos del cliente:\n${partes.join("\n")}`;
  }
  return [base, extra && `\nIndicaciones adicionales del negocio:\n${extra}`, contexto]
    .filter(Boolean)
    .join("\n");
}

/** Convierte el historial en mensajes para la API (roles alternados). */
function aMensajes(
  historia: FilaMsg[],
): { role: "user" | "assistant"; content: string }[] {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const f of historia) {
    if (!f.texto?.trim()) continue;
    const role = f.direccion === "in" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n" + f.texto;
    else msgs.push({ role, content: f.texto });
  }
  // La API exige que el primer mensaje sea del usuario.
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  return msgs;
}

/** Llama a la API de Claude y devuelve el texto de la respuesta. */
async function generarRespuesta(
  system: string,
  mensajes: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || mensajes.length === 0) return "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 400,
      system,
      messages: mensajes,
    }),
  });
  if (!res.ok) {
    console.error("IA: error de Anthropic", res.status, await res.text());
    return "";
  }
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const texto = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  return texto;
}

/**
 * Genera y envía una respuesta automática de la IA para una conversación.
 * Best-effort: nunca lanza.
 */
export async function responderConIA(
  sb: SupabaseClient,
  ctx: { telefono: string; expedienteId?: string | null },
): Promise<void> {
  try {
    if (!iaAgenteActivo()) return;

    // Historial reciente del hilo.
    const { data } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, agente, created_at")
      .eq("telefono", ctx.telefono)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORIAL);
    const historia = (data as FilaMsg[]) ?? [];
    if (historia.length === 0) return;

    // Toma de control humano: si la última respuesta saliente la mandó una
    // persona (agente distinto de "IA" y no vacío), la IA no interviene.
    const ultimoOut = historia
      .slice()
      .reverse()
      .find((f) => f.direccion === "out");
    if (ultimoOut && ultimoOut.agente && ultimoOut.agente !== NOMBRE_AGENTE) {
      return;
    }

    // Contexto del expediente (si lo hay).
    let exp: FilaExp | null = null;
    if (ctx.expedienteId) {
      const { data: e } = await sb
        .from("expedientes")
        .select("cliente, primer_apellido, fraccionamiento, etapa, situacion")
        .eq("id", ctx.expedienteId)
        .maybeSingle();
      exp = (e as FilaExp) ?? null;
    }

    const textoAI = await generarRespuesta(
      instrucciones(exp),
      aMensajes(historia),
    );
    if (!textoAI) return;

    let textoRespuesta = "";
    let datosExtraidos: {
      fraccionamiento?: string | null;
      valor_estimado?: number | null;
      saldo_deuda?: number | null;
      situacion_fisica?: "vandalizada" | "deshabitada" | "bueno" | null;
    } = {};

    try {
      // Intentamos parsear JSON
      const parsed = JSON.parse(textoAI);
      textoRespuesta = parsed.respuesta || "";
      datosExtraidos = parsed.datosExtraidos || {};
    } catch {
      // Fallback por si Claude no devolvió JSON
      textoRespuesta = textoAI;
    }

    if (!textoRespuesta) return;

    const r = await enviarWhatsAppTexto(ctx.telefono, textoRespuesta);
    await sb.from("mensajes_whatsapp").insert({
      telefono: ctx.telefono,
      texto: textoRespuesta,
      direccion: "out",
      expediente_id: ctx.expedienteId ?? null,
      estado: r.ok ? "enviado" : "error",
      agente: NOMBRE_AGENTE,
    });

    if (r.ok && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: "Respuesta automática (IA) por WhatsApp",
        detalle: textoRespuesta,
      });

      // Procesamos la actualización de datos extraídos
      const updates: Record<string, any> = {};
      if (datosExtraidos.fraccionamiento) {
        updates.fraccionamiento = datosExtraidos.fraccionamiento;
      }
      if (datosExtraidos.valor_estimado) {
        updates.valor_estimado = Number(datosExtraidos.valor_estimado);
      }
      if (datosExtraidos.saldo_deuda) {
        updates.saldo_deuda = Number(datosExtraidos.saldo_deuda);
      }
      if (datosExtraidos.situacion_fisica) {
        let desc = "";
        if (datosExtraidos.situacion_fisica === "vandalizada") {
          desc = "Propiedad vandalizada.";
        } else if (datosExtraidos.situacion_fisica === "deshabitada") {
          desc = "Propiedad deshabitada.";
        } else if (datosExtraidos.situacion_fisica === "bueno") {
          desc = "Propiedad en buen estado.";
        }
        if (desc) {
          updates.situacion = desc;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: errUpdate } = await sb
          .from("expedientes")
          .update(updates)
          .eq("id", ctx.expedienteId);
        
        if (errUpdate) {
          console.error("IA: Error al actualizar expediente con datos:", errUpdate);
        } else {
          const detalleActividad = Object.entries(updates)
            .map(([col, val]) => `${col}: ${val}`)
            .join(", ");
          await registrarActividad(sb, {
            expedienteId: ctx.expedienteId,
            tipo: "sistema",
            titulo: "Datos de propiedad actualizados por IA",
            detalle: `Extraídos del chat: ${detalleActividad}`,
          });
        }
      }
    }
  } catch (err) {
    console.error("IA: no se pudo responder:", err);
  }
}
