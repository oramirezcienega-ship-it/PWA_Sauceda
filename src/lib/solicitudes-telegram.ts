import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarMensajeTelegram, obtenerConfiguracionTelegram, responderCallbackQueryTelegram } from "@/lib/telegram";
import { enviarFotosTelegram } from "@/lib/telegram-envios";
import { registrarRespuestaSolicitud } from "@/lib/solicitudes-proveedor";

/**
 * Solicitudes a proveedor por Telegram (migración 0159): coordinar la fecha de un servicio
 * ya cotizado. Botones (callback_data ≤ 64 bytes):
 *   sp:a:{envio}  Lo tomo → marcar días      sp:d:{envio}:{YYYYMMDD}   alternar día
 *   sp:dl:{envio} días listos → franjas      sp:f:{envio}:{YYYYMMDD}{M|T} alternar franja
 *   sp:fl:{envio} franjas listas → resumen   sp:ok:{envio} enviar · sp:v / sp:n visita / no puedo
 * Se piden al menos 2 opciones (día + mañana/tarde).
 */

type Teclado = Array<Array<{ text: string; callback_data: string }>>;

const MIN_OPCIONES = 2;
const DIAS_A_OFRECER = 10;
const FRANJA = { M: "mañana (9–13 h)", T: "tarde (14–18 h)" } as const;

const sinMarkdown = (t: string) => (t || "").replace(/[_*`[\]]/g, "");
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;

/** Próximos días hábiles (lunes a sábado) en hora de México, como YYYYMMDD. */
function proximosDias(): string[] {
  const dias: string[] = [];
  const base = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  for (let i = 1; dias.length < DIAS_A_OFRECER && i < 20; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    if (d.getDay() === 0) continue;
    dias.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`);
  }
  return dias;
}

function fechaDe(codigo: string): Date {
  return new Date(Number(codigo.slice(0, 4)), Number(codigo.slice(4, 6)) - 1, Number(codigo.slice(6, 8)));
}

/** "Jue 23 oct" */
function etiquetaDia(codigo: string): string {
  const t = fechaDe(codigo).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Jue 23 oct · tarde (14–18 h)" */
export function etiquetaOpcion(codigo: string): string {
  const franja = codigo.slice(8) as "M" | "T";
  return `${etiquetaDia(codigo)} · ${FRANJA[franja] || ""}`.trim();
}

/** Fecha programada (ISO, hora de inicio de la franja) a partir del código de opción. */
export function fechaProgramadaDeOpcion(codigo: string): string | null {
  if (!/^\d{8}[MT]$/.test(codigo)) return null;
  const hora = codigo.endsWith("M") ? "09:00:00" : "14:00:00";
  return `${codigo.slice(0, 4)}-${codigo.slice(4, 6)}-${codigo.slice(6, 8)}T${hora}-06:00`;
}

function tecladoDias(envioId: string, seleccion: string[]): Teclado {
  const dias = proximosDias();
  const filas: Teclado = [];
  for (let i = 0; i < dias.length; i += 2) {
    filas.push(
      dias.slice(i, i + 2).map((d) => ({
        text: `${seleccion.includes(d) ? "✅ " : ""}${etiquetaDia(d)}`,
        callback_data: `sp:d:${envioId}:${d}`,
      }))
    );
  }
  filas.push([{ text: "Siguiente ➜ elegir horario", callback_data: `sp:dl:${envioId}` }]);
  return filas;
}

function tecladoFranjas(envioId: string, dias: string[], seleccion: string[]): Teclado {
  const filas: Teclado = dias.map((d) =>
    (["M", "T"] as const).map((f) => ({
      text: `${seleccion.includes(d + f) ? "✅ " : ""}${etiquetaDia(d)} ${f === "M" ? "☀️ mañana" : "🌇 tarde"}`,
      callback_data: `sp:f:${envioId}:${d}${f}`,
    }))
  );
  filas.push([
    { text: "⬅ Cambiar días", callback_data: `sp:a:${envioId}` },
    { text: "Listo ✓", callback_data: `sp:fl:${envioId}` },
  ]);
  return filas;
}

async function editarTeclado(botToken: string, chatId: string, messageId: number, teclado: Teclado) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: teclado } }),
    });
  } catch (err) {
    console.warn("[solicitudes-telegram] No se pudo actualizar el teclado:", err);
  }
}

/** Envía la solicitud al proveedor por Telegram. Devuelve false si no se pudo (se usa WhatsApp). */
export async function notificarSolicitudTelegram(
  sb: SupabaseClient,
  d: {
    envioId: string;
    chatId: string;
    folio: string;
    producto: string;
    cantidad: number | null;
    unidad: string;
    zona: string;
    descripcion: string;
    fechasSugeridas: string;
    urgente: boolean;
    costo: number | null;
    fechaLimite: string;
    fotos: string[];
  }
): Promise<boolean> {
  const { botToken } = await obtenerConfiguracionTelegram(sb);
  if (!botToken) return false;
  if (d.fotos.length > 0) {
    await enviarFotosTelegram({ botToken, chatId: d.chatId, urls: d.fotos, caption: `${d.folio} · fotos del servicio` });
  }
  const texto =
    `🔧 *SAUCEDA · Servicio ${sinMarkdown(d.folio)}*${d.urgente ? " · *URGENTE*" : ""}\n\n` +
    `*${sinMarkdown(d.producto)}*${d.cantidad ? ` — ${d.cantidad.toLocaleString("es-MX")} ${sinMarkdown(d.unidad)}` : ""}\n` +
    (d.zona ? `📍 ${sinMarkdown(d.zona)}\n` : "") +
    (d.descripcion ? `📝 ${sinMarkdown(d.descripcion.slice(0, 800))}\n` : "") +
    (d.costo !== null ? `💲 Tu costo: *${pesos(d.costo)}*\n` : "") +
    (d.fechasSugeridas ? `🗓 Al cliente le acomoda: ${sinMarkdown(d.fechasSugeridas)}\n` : "") +
    `\n¿Lo puedes tomar? Si sí, propón al menos ${MIN_OPCIONES} opciones de día y horario.` +
    (d.fechaLimite ? `\nResponde antes del ${d.fechaLimite}.` : "");
  const r = await enviarMensajeTelegram({
    botToken,
    chatId: d.chatId,
    texto,
    inlineKeyboard: [
      [{ text: "✅ Lo tomo", callback_data: `sp:a:${d.envioId}` }],
      [
        { text: "🔎 Necesito visita", callback_data: `sp:v:${d.envioId}` },
        { text: "✖ No puedo", callback_data: `sp:n:${d.envioId}` },
      ],
    ],
  });
  return r.ok;
}

async function envioConProveedor(sb: SupabaseClient, envioId: string) {
  const { data } = await sb
    .from("solicitudes_proveedor_envios")
    .select("id, estado, tg_paso, tg_dias, tg_opciones, proveedores:proveedor_id ( id, nombre, telegram_chat_id ), solicitudes_proveedor:solicitud_id ( folio )")
    .eq("id", envioId)
    .maybeSingle();
  return data as any;
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Botones de la solicitud. Devuelve true si el callback era de este módulo. */
export async function manejarCallbackSolicitud(sb: SupabaseClient, botToken: string, cb: any): Promise<boolean> {
  const m = String(cb.data || "").match(/^sp:(a|d|dl|f|fl|ok|v|n):([0-9a-f-]{36})(?::(\d{8}[MT]?))?$/i);
  if (!m) return false;
  const [, accion, envioId, extra] = m;
  const chatId = String(cb.message?.chat?.id ?? cb.from?.id ?? "");
  const messageId: number | undefined = cb.message?.message_id;
  const e = await envioConProveedor(sb, envioId);
  const prov = e?.proveedores;

  if (!e || !prov || String(prov.telegram_chat_id) !== chatId) {
    await responderCallbackQueryTelegram(botToken, cb.id, "No pude identificar esta solicitud.", true);
    return true;
  }
  if (!["enviada", "vista"].includes(e.estado)) {
    const motivo =
      e.estado === "aceptada" ? "Ya respondiste esta solicitud." : e.estado === "vencida" ? "El plazo para responder ya pasó." : "Esta solicitud ya no está activa.";
    await responderCallbackQueryTelegram(botToken, cb.id, motivo, true);
    return true;
  }

  const folio = e.solicitudes_proveedor?.folio || "";
  const ahora = new Date().toISOString();
  const guardar = (cambios: Record<string, unknown>) =>
    sb.from("solicitudes_proveedor_envios").update({ ...cambios, updated_at: ahora }).eq("id", envioId);
  const dias = lista(e.tg_dias);
  const opciones = lista(e.tg_opciones);

  if (accion === "a") {
    await guardar({ estado: "vista", tg_paso: "dias", vista_at: ahora });
    await responderCallbackQueryTelegram(botToken, cb.id, "Marca los días que puedes");
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: `🗓 *${sinMarkdown(folio)}* · Marca los *días* que puedes hacerlo y toca *Siguiente*.`,
      inlineKeyboard: tecladoDias(envioId, dias),
    });
    return true;
  }

  if (accion === "d" && extra) {
    const nuevos = dias.includes(extra) ? dias.filter((x) => x !== extra) : [...dias, extra].sort();
    await guardar({ tg_dias: nuevos, tg_opciones: opciones.filter((o) => nuevos.includes(o.slice(0, 8))) });
    await responderCallbackQueryTelegram(botToken, cb.id, dias.includes(extra) ? "Quitado" : "Agregado");
    if (messageId) await editarTeclado(botToken, chatId, messageId, tecladoDias(envioId, nuevos));
    return true;
  }

  if (accion === "dl") {
    if (dias.length === 0) {
      await responderCallbackQueryTelegram(botToken, cb.id, "Marca al menos un día.", true);
      return true;
    }
    await guardar({ tg_paso: "franjas" });
    await responderCallbackQueryTelegram(botToken, cb.id, "Ahora el horario");
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: `⏰ *${sinMarkdown(folio)}* · ¿En qué *horario* de cada día? Elige al menos ${MIN_OPCIONES} opciones en total.`,
      inlineKeyboard: tecladoFranjas(envioId, dias, opciones),
    });
    return true;
  }

  if (accion === "f" && extra) {
    const nuevas = opciones.includes(extra) ? opciones.filter((x) => x !== extra) : [...opciones, extra].sort();
    await guardar({ tg_opciones: nuevas });
    await responderCallbackQueryTelegram(botToken, cb.id, `${nuevas.length} opción(es)`);
    if (messageId) await editarTeclado(botToken, chatId, messageId, tecladoFranjas(envioId, dias, nuevas));
    return true;
  }

  if (accion === "fl") {
    if (opciones.length < MIN_OPCIONES) {
      await responderCallbackQueryTelegram(botToken, cb.id, `Elige al menos ${MIN_OPCIONES} opciones (día + horario).`, true);
      return true;
    }
    await guardar({ tg_paso: "confirmar" });
    await responderCallbackQueryTelegram(botToken, cb.id, "Revisa y envía");
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: `📄 *${sinMarkdown(folio)}* · Tus opciones para el cliente:\n\n${opciones.map((o, i) => `${i + 1}. ${etiquetaOpcion(o)}`).join("\n")}`,
      inlineKeyboard: [
        [
          { text: "✓ Enviar", callback_data: `sp:ok:${envioId}` },
          { text: "✎ Cambiar", callback_data: `sp:a:${envioId}` },
        ],
      ],
    });
    return true;
  }

  if (accion === "ok") {
    if (opciones.length < MIN_OPCIONES) {
      await responderCallbackQueryTelegram(botToken, cb.id, `Elige al menos ${MIN_OPCIONES} opciones.`, true);
      return true;
    }
    const r = await registrarRespuestaSolicitud(sb, envioId, prov, {
      tipo: "aceptada",
      fechas: opciones.map(etiquetaOpcion),
      opciones,
    });
    await responderCallbackQueryTelegram(botToken, cb.id, r.ok ? "¡Enviado!" : "No se pudo", !r.ok);
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: r.ok
        ? `✅ ¡Gracias, ${sinMarkdown(prov.nombre)}! Le ofrecemos tus opciones al cliente y te confirmamos por aquí la que elija.`
        : `⚠️ ${sinMarkdown(r.mensaje || "No se pudo registrar tu respuesta.")}`,
    });
    return true;
  }

  if (accion === "v") {
    await guardar({ tg_paso: "visita" });
    await responderCallbackQueryTelegram(botToken, cb.id, "Cuéntanos qué revisar");
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: `🔎 *${sinMarkdown(folio)}* · ¿Qué necesitas revisar en sitio? Escríbelo en un mensaje.`,
    });
    return true;
  }

  // n: no puede
  const r = await registrarRespuestaSolicitud(sb, envioId, prov, { tipo: "rechazada" });
  await responderCallbackQueryTelegram(botToken, cb.id, r.ok ? "Anotado, gracias" : r.mensaje || "No se pudo", !r.ok);
  if (r.ok) await enviarMensajeTelegram({ botToken, chatId, texto: `👍 Gracias por avisar. Quitamos *${sinMarkdown(folio)}* de tu lista.` });
  return true;
}

/** Texto libre del proveedor (solo para "Necesito visita": qué revisar). */
export async function manejarTextoSolicitud(sb: SupabaseClient, botToken: string, chatId: string, texto: string): Promise<boolean> {
  const { data: provs } = await sb.from("proveedores").select("id, nombre").eq("telegram_chat_id", chatId);
  if (!provs || provs.length === 0) return false;
  const { data: enCurso } = await sb
    .from("solicitudes_proveedor_envios")
    .select("id, proveedor_id, solicitudes_proveedor:solicitud_id ( folio )")
    .in(
      "proveedor_id",
      provs.map((p: any) => p.id)
    )
    .eq("tg_paso", "visita")
    .order("updated_at", { ascending: false })
    .limit(1);
  const e: any = enCurso?.[0];
  if (!e) return false;
  const prov = provs.find((p: any) => p.id === e.proveedor_id)!;
  const r = await registrarRespuestaSolicitud(sb, e.id, prov, { tipo: "requiere_visita", comentario: texto });
  await enviarMensajeTelegram({
    botToken,
    chatId,
    texto: r.ok
      ? `🔎 Anotado. Un asesor de SAUCEDA te contacta para coordinar la visita de *${sinMarkdown(e.solicitudes_proveedor?.folio || "")}*.`
      : `⚠️ ${sinMarkdown(r.mensaje || "No se pudo registrar.")}`,
  });
  return true;
}

/** Avisa al proveedor que el cliente eligió una de sus opciones. */
export async function avisarConfirmacionProveedor(
  sb: SupabaseClient,
  d: { proveedorId: string; folio: string; producto: string; fecha: string; ordenFolio?: string | null }
): Promise<void> {
  const { botToken } = await obtenerConfiguracionTelegram(sb);
  if (!botToken) return;
  const { data: prov } = await sb.from("proveedores").select("telegram_chat_id").eq("id", d.proveedorId).maybeSingle();
  if (!prov?.telegram_chat_id) return;
  await enviarMensajeTelegram({
    botToken,
    chatId: prov.telegram_chat_id,
    texto:
      `✅ *Confirmado* · ${sinMarkdown(d.folio)}\n\n*${sinMarkdown(d.producto)}*\n🗓 ${sinMarkdown(d.fecha)}` +
      (d.ordenFolio ? `\n🧾 Orden de trabajo ${sinMarkdown(d.ordenFolio)}` : "") +
      `\n\nUn asesor de SAUCEDA te comparte los datos para el servicio.`,
  });
}
