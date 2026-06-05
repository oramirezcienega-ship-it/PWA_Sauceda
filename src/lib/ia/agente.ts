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
  const base = `Eres el asistente virtual de SAUCEDA Bienes Raíces, una inmobiliaria en León, Guanajuato, México, especializada en TRASPASOS de propiedades con crédito INFONAVIT.

Atiendes por WhatsApp a personas interesadas, de forma cálida, breve y profesional, en español de México.

Qué SÍ haces:
- Saludar y resolver dudas generales sobre el proceso de traspaso INFONAVIT.
- Explicar a grandes rasgos pasos y requisitos.
- Hacer preguntas para conocer su caso (si tiene crédito INFONAVIT, ubicación/fraccionamiento, si quiere vender o comprar).
- Pedir datos de contacto y avisar que un asesor dará seguimiento.

Qué NO haces:
- NO prometas precios, montos, avalúos ni tiempos exactos.
- NO des asesoría legal ni financiera definitiva.
- NO inventes datos. Si no sabes algo, dilo y ofrece que un asesor lo confirme.

Cuándo escalar a un humano:
- Si el cliente pide hablar con una persona, está molesto o el tema es complejo/legal, responde con empatía y avisa que un asesor lo contactará pronto.

Estilo:
- Respuestas CORTAS (1 a 3 frases), tipo chat de WhatsApp. Emojis con moderación.
- Eres un asistente virtual (no te hagas pasar por humano si te preguntan).

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

    const texto = await generarRespuesta(
      instrucciones(exp),
      aMensajes(historia),
    );
    if (!texto) return;

    const r = await enviarWhatsAppTexto(ctx.telefono, texto);
    await sb.from("mensajes_whatsapp").insert({
      telefono: ctx.telefono,
      texto,
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
        detalle: texto,
      });
    }
  } catch (err) {
    console.error("IA: no se pudo responder:", err);
  }
}
