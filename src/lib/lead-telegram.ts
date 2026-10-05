import type { SupabaseClient } from "@supabase/supabase-js";
import { labelTipoNegocio } from "@/lib/types";
import { variantesTelefono, normalizarTelefono, formatearTelefonoLegible } from "@/lib/telefono";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";
import type { DatosLeadTelegram } from "@/lib/lead-telegram-formato";

/**
 * Pasar un lead a un asesor por Telegram (desde Conversaciones): ficha del
 * cliente, conversación en TXT, fotos del cliente, confirmación de lectura y
 * recordatorio si no confirma.
 */

/** Horas sin confirmación tras las que se recuerda al asesor y se avisa a quien envió. */
export const HORAS_RECORDATORIO_LEAD = 2;

const MAX_FOTOS = 10;

export interface FotoCliente {
  /** mediaId de WhatsApp o URL http(s). */
  ref: string;
  numero: number;
  caption: string;
}

export interface InformacionLead {
  datos: DatosLeadTelegram;
  txt: string;
  nombreArchivo: string;
  /** Últimas fotos del cliente (máx. 10) que se envían como álbum. */
  fotos: FotoCliente[];
  /** Conversación compacta para el resumen de la IA. */
  transcripcion: string;
  telefono: string;
}

const esSocial = (t: string) => t.startsWith("messenger:") || t.startsWith("instagram:");
const variantes = (t: string) => (esSocial(t) ? [t] : variantesTelefono(t));

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Convierte el texto guardado de un mensaje (con marcadores [image:..]) a texto plano legible. */
function textoPlano(texto: string, numeroFoto?: number, enAlbum?: boolean): string {
  const t = (texto || "").trim();
  const m = t.match(/^\[(image|video|audio|document|sticker|location)(?::([^\]]*))?\]\s*([\s\S]*)$/);
  if (m) {
    const [, tipo, , resto] = m;
    const extra = (resto || "").trim();
    const etiqueta: Record<string, string> = {
      image: numeroFoto ? `[Foto ${numeroFoto}${enAlbum ? " · en el álbum" : ""}]` : "[Foto]",
      video: "[Video]",
      audio: "[Nota de voz]",
      document: "[Documento]",
      sticker: "[Sticker]",
      location: "[Ubicación]",
    };
    const limpio = extra === "(mensaje de tipo audio)" ? "" : extra;
    return `${etiqueta[tipo]}${limpio ? ` ${textoPlano(limpio)}` : ""}`;
  }
  const p = t.match(/^\[[pP]lantilla:\s*([^\]]+)\]\s*([\s\S]*)$/);
  if (p) return `[Plantilla ${p[1].trim()}] ${p[2].trim()}`.trim();
  return t;
}

/** Arma la ficha del lead, la conversación en texto plano y la lista de fotos del cliente. */
export async function armarInformacionLead(
  sb: SupabaseClient,
  telefono: string,
  asignadoPor: string
): Promise<{ ok: boolean; error?: string; info?: InformacionLead }> {
  const { data: filas, error } = await sb
    .from("mensajes_whatsapp")
    .select("texto, direccion, agente, created_at, expediente_id, prospecto_id")
    .in("telefono", variantes(telefono))
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const msgs = (filas || []) as {
    texto: string;
    direccion: "in" | "out";
    agente: string | null;
    created_at: string;
    expediente_id: string | null;
    prospecto_id: string | null;
  }[];
  if (msgs.length === 0) return { ok: false, error: "La conversación no tiene mensajes." };

  // Expediente / prospecto (el último mensaje que los tenga; si no, por teléfono)
  const conIds = [...msgs].reverse().find((m) => m.expediente_id || m.prospecto_id);
  let expedienteId = conIds?.expediente_id ?? null;
  let prospectoId = conIds?.prospecto_id ?? null;
  if (!prospectoId && !esSocial(telefono)) {
    const { data: p } = await sb
      .from("prospectos")
      .select("id")
      .in("telefono", variantes(telefono))
      .order("created_at", { ascending: false })
      .limit(1);
    prospectoId = p?.[0]?.id ?? null;
  }
  if (!expedienteId && prospectoId) {
    const { data: e } = await sb.from("expedientes").select("id").eq("prospecto_id", prospectoId).limit(1);
    expedienteId = e?.[0]?.id ?? null;
  }

  const [{ data: exp }, { data: pros }] = await Promise.all([
    expedienteId
      ? sb.from("expedientes").select("*").eq("id", expedienteId).maybeSingle()
      : Promise.resolve({ data: null as any }),
    prospectoId
      ? sb.from("prospectos").select("*").eq("id", prospectoId).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const nombreCompleto = (o: any, campo: string) =>
    o ? [o[campo], o.primer_apellido, o.segundo_apellido].filter(Boolean).join(" ").trim() : "";
  const clienteNombre = nombreCompleto(pros, "nombre") || nombreCompleto(exp, "cliente") || "Cliente";
  const tipoRaw = exp?.tipo_negocio || pros?.tipo_negocio || "";
  const direccion = [exp?.direccion_propiedad || pros?.direccion || "", exp?.fraccionamiento || ""]
    .filter(Boolean)
    .join(", ");
  const necesidad = String(exp?.necesidad || pros?.notas || "").trim();

  // Fotos del cliente (entrantes), numeradas en orden; se envían las últimas 10
  const fotosTodas: FotoCliente[] = [];
  for (const m of msgs) {
    if (m.direccion !== "in") continue;
    const f = (m.texto || "").match(/^\[image:([^\]]+)\]\s*([\s\S]*)$/);
    if (f) fotosTodas.push({ ref: f[1], numero: fotosTodas.length + 1, caption: (f[2] || "").trim() });
  }
  const fotos = fotosTodas.slice(-MAX_FOTOS);
  const enAlbum = new Set(fotos.map((f) => f.numero));

  const quien = (m: (typeof msgs)[number]) =>
    m.direccion === "in" ? "Cliente" : !m.agente || m.agente === "IA" ? "Sofía (IA)" : m.agente;

  let nFoto = 0;
  const lineas = msgs.map((m) => {
    const esFotoCliente = m.direccion === "in" && /^\[image:/.test(m.texto || "");
    const num = esFotoCliente ? ++nFoto : undefined;
    return `${fechaHora(m.created_at)}  ${quien(m)}: ${textoPlano(m.texto, num, num ? enAlbum.has(num) : false)}`;
  });

  const telefonoLegible = esSocial(telefono) ? telefono : formatearTelefonoLegible(telefono);
  const folios = [expedienteId, prospectoId].filter(Boolean).join(" · ");
  const encabezado = [
    `CONVERSACIÓN WHATSAPP · ${clienteNombre}`,
    `Teléfono: ${telefonoLegible}${folios ? ` · ${folios}` : ""}`,
    `Exportada: ${fechaHora(new Date().toISOString())} · ${msgs.length} mensajes`,
    fotosTodas.length > fotos.length
      ? `Fotos del cliente: ${fotosTodas.length} (se enviaron las últimas ${fotos.length})`
      : `Fotos del cliente: ${fotosTodas.length}`,
    "-".repeat(48),
    "",
  ];
  const txt = [...encabezado, ...lineas, ""].join("\n");

  const slug = clienteNombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  return {
    ok: true,
    info: {
      telefono,
      txt,
      nombreArchivo: `conversacion_${slug || "cliente"}.txt`,
      fotos,
      transcripcion: lineas.slice(-80).join("\n").slice(-12000),
      datos: {
        clienteNombre,
        telefonoLegible,
        telefonoWa: esSocial(telefono) ? "" : normalizarTelefono(telefono),
        tipoNegocio: tipoRaw ? labelTipoNegocio(tipoRaw) : "",
        expedienteId,
        prospectoId,
        direccion,
        necesidad,
        asignadoPor,
        fotosCliente: fotos.length,
        totalMensajes: msgs.length,
      },
    },
  };
}

/** Resumen breve de la conversación para el asesor. Si no hay IA disponible devuelve "". */
export async function generarResumenLeadIA(transcripcion: string, clienteNombre: string): Promise<string> {
  const system = `Eres el coordinador comercial de SAUCEDA (construcción, impermeabilización y servicios para el hogar en León, Gto.).
Vas a pasarle un cliente a un asesor de ventas. Resume la conversación de WhatsApp en 3 a 5 líneas cortas, en español mexicano, sin saludos:
- Qué necesita el cliente (servicio, m², ubicación si la dio).
- Qué se le ha enviado o cotizado y precios mencionados.
- Dudas u objeciones que expresó.
- En qué punto quedó y cuál es el siguiente paso para el asesor.
No inventes datos que no estén en la conversación. Texto plano, una idea por línea, empezando cada línea con "• ".`;
  const user = `Cliente: ${clienteNombre}\n\nConversación:\n${transcripcion}`;

  try {
    const proveedor = process.env.IA_PROVEEDOR || (process.env.KIMI_API_KEY ? "kimi" : "anthropic");
    if (proveedor === "kimi" && process.env.KIMI_API_KEY) {
      const res = await fetch(`${process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1"}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.KIMI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.KIMI_MODEL || "kimi-k3",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) return "";
      const json = await res.json();
      return String(json.choices?.[0]?.message?.content || "").trim();
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
          max_tokens: 500,
          temperature: 0.2,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) return "";
      const json = await res.json();
      return String(json.content?.[0]?.text || "").trim();
    }
  } catch (err) {
    console.warn("[Lead Telegram] No se pudo generar el resumen:", err);
  }
  return "";
}

/** Descarga una foto de WhatsApp (mediaId) o de una URL pública. */
export async function descargarMediaWhatsApp(
  ref: string
): Promise<{ contenido: Buffer; mimeType: string } | null> {
  try {
    let url = ref;
    let headers: Record<string, string> = {};
    if (!/^https?:\/\//i.test(ref)) {
      const token = process.env.WHATSAPP_TOKEN;
      if (!token) return null;
      headers = { Authorization: `Bearer ${token}` };
      const info = await fetch(`https://graph.facebook.com/v21.0/${ref}`, { headers });
      if (!info.ok) return null;
      const j = (await info.json()) as { url?: string };
      if (!j.url) return null;
      url = j.url;
    }
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const mimeType = r.headers.get("content-type") || "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    return { contenido: Buffer.from(await r.arrayBuffer()), mimeType };
  } catch {
    return null;
  }
}

export const tecladoLead = (envioId: string) => [
  [
    { text: "✅ Recibido, lo atiendo", callback_data: `L:${envioId}:1` },
    { text: "❌ No puedo atenderlo", callback_data: `L:${envioId}:0` },
  ],
];

function horaCortaMx(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Título de la actividad en la bitácora según el estado del envío. */
export function tituloActividadLead(e: {
  asesor_nombre: string;
  estado: string;
  respondido_at?: string | null;
  respondido_via?: string | null;
}): string {
  const base = `📨 Lead enviado a ${e.asesor_nombre} por Telegram`;
  if (e.estado === "revisado")
    return `${base} — 🟢 Revisado ${e.respondido_at ? horaCortaMx(e.respondido_at) : ""}${
      e.respondido_via === "manual" ? " (marcado a mano)" : ""
    }`.trim();
  if (e.estado === "rechazado")
    return `${base} — 🔴 No puede atenderlo ${e.respondido_at ? horaCortaMx(e.respondido_at) : ""}`.trim();
  return `${base} — 🟡 Pendiente de revisar`;
}

/** Chat de Telegram de quien envió el lead (o del grupo, si no lo tiene vinculado). */
async function chatDeRemitente(sb: SupabaseClient, enviadoPorId: string | null, chatIdGrupo: string) {
  if (enviadoPorId) {
    const { data } = await sb.from("perfiles").select("telegram_chat_id").eq("id", enviadoPorId).maybeSingle();
    if (data?.telegram_chat_id) return data.telegram_chat_id as string;
  }
  return chatIdGrupo || "";
}

/**
 * Registra la respuesta del asesor (botón de Telegram o marca manual):
 * actualiza el envío y su actividad en la bitácora y, si no puede atenderlo,
 * avisa a quien lo envió.
 */
export async function registrarRespuestaLead(
  sb: SupabaseClient,
  envioId: string,
  estado: "revisado" | "rechazado",
  via: "telegram" | "manual"
): Promise<{ ok: boolean; error?: string; yaRespondido?: boolean; envio?: any }> {
  const { data: envio } = await sb.from("leads_envios_telegram").select("*").eq("id", envioId).maybeSingle();
  if (!envio) return { ok: false, error: "Envío no encontrado." };
  if (envio.estado !== "enviado") return { ok: true, yaRespondido: true, envio };

  const ahora = new Date().toISOString();
  const { data: act } = await sb
    .from("leads_envios_telegram")
    .update({ estado, respondido_at: ahora, respondido_via: via })
    .eq("id", envioId)
    .eq("estado", "enviado")
    .select("*")
    .maybeSingle();
  if (!act) return { ok: true, yaRespondido: true, envio };

  if (act.actividad_id) {
    await sb.from("actividades").update({ titulo: tituloActividadLead(act) }).eq("id", act.actividad_id);
  }

  if (estado === "rechazado") {
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    const chat = botToken ? await chatDeRemitente(sb, act.enviado_por_id, chatIdGrupo) : "";
    if (chat) {
      await enviarMensajeTelegram({
        botToken,
        chatId: chat,
        parseMode: "HTML",
        texto: `🔴 <b>${escHtml(act.asesor_nombre)}</b> indicó que <b>no puede atender</b> a ${escHtml(
          act.cliente_nombre
        )} (${escHtml(formatearTelefonoLegible(act.telefono))}).\nReasígnalo desde Conversaciones.`,
      });
    }
  }
  return { ok: true, envio: act };
}

const escHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Recordatorio único para los leads sin confirmar tras HORAS_RECORDATORIO_LEAD:
 * se le recuerda al asesor (con los mismos botones) y se avisa a quien lo envió.
 */
export async function procesarRecordatoriosLeadsTelegram(sb: SupabaseClient): Promise<{ recordados: number }> {
  const limite = new Date(Date.now() - HORAS_RECORDATORIO_LEAD * 3600 * 1000).toISOString();
  const { data: pendientes } = await sb
    .from("leads_envios_telegram")
    .select("id")
    .eq("estado", "enviado")
    .is("recordatorio_at", null)
    .lte("created_at", limite)
    .limit(20);
  if (!pendientes?.length) return { recordados: 0 };

  const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
  if (!botToken) return { recordados: 0 };

  let recordados = 0;
  for (const { id } of pendientes) {
    // Se "reclama" el envío para que dos ejecuciones simultáneas no recuerden dos veces
    const { data: e } = await sb
      .from("leads_envios_telegram")
      .update({ recordatorio_at: new Date().toISOString() })
      .eq("id", id)
      .is("recordatorio_at", null)
      .eq("estado", "enviado")
      .select("*")
      .maybeSingle();
    if (!e) continue;

    const { data: asesor } = await sb.from("perfiles").select("telegram_chat_id").eq("id", e.asesor_id).maybeSingle();
    if (asesor?.telegram_chat_id) {
      await enviarMensajeTelegram({
        botToken,
        chatId: asesor.telegram_chat_id,
        parseMode: "HTML",
        texto: `⏰ <b>RECORDATORIO</b>\nTienes pendiente confirmar el lead de <b>${escHtml(e.cliente_nombre)}</b> (${escHtml(
          formatearTelefonoLegible(e.telefono)
        )}) que te enviaron hace más de ${HORAS_RECORDATORIO_LEAD} h.\nLa información completa está en el mensaje anterior.`,
        inlineKeyboard: tecladoLead(e.id),
      });
    }

    const chat = await chatDeRemitente(sb, e.enviado_por_id, chatIdGrupo);
    if (chat) {
      await enviarMensajeTelegram({
        botToken,
        chatId: chat,
        parseMode: "HTML",
        texto: `⏰ <b>${escHtml(e.asesor_nombre)}</b> aún no confirma el lead de <b>${escHtml(
          e.cliente_nombre
        )}</b> (${escHtml(formatearTelefonoLegible(e.telefono))}), enviado ${horaCortaMx(
          e.created_at
        )}. Ya se le envió un recordatorio.`,
      });
    }

    if (e.actividad_id) {
      const { data: act } = await sb.from("actividades").select("detalle").eq("id", e.actividad_id).maybeSingle();
      await sb
        .from("actividades")
        .update({ detalle: `${act?.detalle || ""}\n⏰ Recordatorio enviado ${horaCortaMx(new Date().toISOString())} (sin confirmación).`.trim() })
        .eq("id", e.actividad_id);
    }
    recordados++;
  }
  return { recordados };
}
