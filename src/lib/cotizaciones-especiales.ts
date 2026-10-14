import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarMensajeTelegram, obtenerConfiguracionTelegram, responderCallbackQueryTelegram } from "@/lib/telegram";
import { enviarFotosBufferTelegram } from "@/lib/telegram-envios";
import { descargarMediaWhatsApp } from "@/lib/lead-telegram";

/**
 * Cotizaciones especiales (migración 0158): peticiones fuera de catálogo que se concursan
 * con los proveedores por Telegram.
 *
 * El proveedor recibe el brief (sin datos del cliente) con botones:
 *   ce:c:{resp} Cotizar → el bot pregunta precio → tiempo → qué incluye → confirmar (ce:ok / ce:ed)
 *   ce:v:{resp} Necesito visita · ce:n:{resp} No lo hago · ce:s:{resp} omitir "qué incluye"
 * Con la mejor cotización + el margen del "Servicio especial" de la línea se prepara la estimación
 * que el asesor aprueba y envía desde Conversaciones.
 */

const SITE_URL = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
const MARGEN_RESPALDO = 35;

const sinMarkdown = (t: string) => (t || "").replace(/[_*`[\]]/g, "");
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
/** Redondea a la centena más cercana (precios al cliente). */
const centena = (n: number) => Math.round(n / 100) * 100;

export async function siguienteFolioCotizacionEspecial(sb: SupabaseClient): Promise<string> {
  const prefijo = `CE-${new Date().getFullYear()}-`;
  const { data } = await sb
    .from("cotizaciones_especiales")
    .select("folio")
    .ilike("folio", `${prefijo}%`)
    .order("folio", { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.folio ? parseInt(String(data[0].folio).replace(prefijo, ""), 10) : 0;
  return `${prefijo}${String((Number.isFinite(ultimo) ? ultimo : 0) + 1).padStart(4, "0")}`;
}

/** Nombre de usuario del bot, para el enlace de vinculación t.me/<bot>?start=prov_<id>. */
export async function usuarioBotTelegram(sb: SupabaseClient): Promise<string | null> {
  try {
    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return null;
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { cache: "no-store" });
    const j = await r.json();
    return j?.ok ? j.result?.username || null : null;
  } catch {
    return null;
  }
}

async function avisarGrupo(sb: SupabaseClient, texto: string, url?: { text: string; url: string }) {
  try {
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    if (!botToken || !chatIdGrupo) return;
    await enviarMensajeTelegram({
      botToken,
      chatId: chatIdGrupo,
      texto,
      inlineKeyboard: url ? [[url]] : undefined,
    });
  } catch (err) {
    console.warn("[cotizaciones-especiales] No se pudo avisar al grupo:", err);
  }
}

const linkConversacion = (telefono: string) => `${SITE_URL()}/conversaciones?tel=${encodeURIComponent(telefono)}`;

function fechaLimiteTexto(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Envía el brief a cada proveedor de la cotización especial por Telegram. */
export async function enviarCotizacionEspecial(sb: SupabaseClient, ceId: string): Promise<{ enviados: number; sinTelegram: string[] }> {
  const { botToken } = await obtenerConfiguracionTelegram(sb);
  const { data: ce } = await sb
    .from("cotizaciones_especiales")
    .select("id, folio, titulo, descripcion, zona, fotos, horas_respuesta, telefono_cliente")
    .eq("id", ceId)
    .maybeSingle();
  if (!ce) return { enviados: 0, sinTelegram: [] };

  const { data: respuestas } = await sb
    .from("cotizaciones_especiales_respuestas")
    .select("id, estado, proveedores:proveedor_id ( id, nombre, telegram_chat_id )")
    .eq("cotizacion_especial_id", ceId)
    .eq("estado", "enviada");

  const ahora = new Date();
  const limite = new Date(ahora.getTime() + Math.max(1, Number(ce.horas_respuesta) || 24) * 3600 * 1000).toISOString();
  // Fotos del cliente: id de medio de WhatsApp o URL. Se descargan una vez y se suben a cada proveedor.
  const refs: string[] = (Array.isArray(ce.fotos) ? ce.fotos : []).map((f: any) => f?.url).filter(Boolean).slice(0, 10);
  const fotos: { contenido: Buffer; mimeType: string; nombre: string }[] = [];
  for (let i = 0; i < refs.length; i++) {
    const media = await descargarMediaWhatsApp(refs[i]);
    if (media) fotos.push({ ...media, nombre: `foto_${i + 1}.${media.mimeType.split("/")[1] || "jpg"}` });
  }
  const sinTelegram: string[] = [];
  let enviados = 0;

  for (const r of respuestas || []) {
    const prov: any = (r as any).proveedores;
    if (!botToken || !prov?.telegram_chat_id) {
      sinTelegram.push(prov?.nombre || "Proveedor");
      await sb.from("cotizaciones_especiales_respuestas").update({ estado: "sin_telegram", updated_at: ahora.toISOString() }).eq("id", r.id);
      continue;
    }
    if (fotos.length > 0) {
      await enviarFotosBufferTelegram({
        botToken,
        chatId: prov.telegram_chat_id,
        fotos: fotos.map((f, i) => (i === 0 ? { ...f, caption: `${ce.folio} · fotos del cliente` } : f)),
      });
    }
    const texto =
      `🔔 *SAUCEDA · Cotización especial ${sinMarkdown(ce.folio)}*\n\n` +
      `🔧 *${sinMarkdown(ce.titulo)}*\n` +
      (ce.zona ? `📍 ${sinMarkdown(ce.zona)}\n` : "") +
      (ce.descripcion ? `📝 ${sinMarkdown(String(ce.descripcion).slice(0, 1500))}\n` : "") +
      `\nNecesitamos una *estimación* de tu precio para SAUCEDA. Responde antes del ${fechaLimiteTexto(limite)}.`;
    const res = await enviarMensajeTelegram({
      botToken,
      chatId: prov.telegram_chat_id,
      texto,
      inlineKeyboard: [
        [{ text: "💲 Cotizar", callback_data: `ce:c:${r.id}` }],
        [
          { text: "🔎 Necesito visita", callback_data: `ce:v:${r.id}` },
          { text: "✖ No lo hago", callback_data: `ce:n:${r.id}` },
        ],
      ],
    });
    if (res.ok) {
      enviados++;
      await sb
        .from("cotizaciones_especiales_respuestas")
        .update({ enviada_at: ahora.toISOString(), fecha_limite: limite, updated_at: ahora.toISOString() })
        .eq("id", r.id);
    } else {
      sinTelegram.push(prov.nombre);
    }
  }

  if (sinTelegram.length > 0) {
    await avisarGrupo(
      sb,
      `⚠️ ${sinMarkdown(ce.folio)}: no se pudo mandar por Telegram a *${sinMarkdown(sinTelegram.join(", "))}* (no tienen Telegram ligado).`,
      { text: "Abrir conversación", url: linkConversacion(ce.telefono_cliente) }
    );
  }
  return { enviados, sinTelegram };
}

/** "18000", "$18,000", "18 mil", "18k", "18.5 mil" → 18000 / 18500. */
export function interpretarPrecio(texto: string): number | null {
  const t = (texto || "").toLowerCase().replace(/\$/g, "").replace(/\s+/g, " ").trim();
  const m = t.match(/(\d+(?:[.,]\d+)*)\s*(mil|k)?/);
  if (!m) return null;
  let numero = m[1];
  // "18,000" o "18.000" con separador de miles; "18.5" decimal
  if (/^\d{1,3}([.,]\d{3})+$/.test(numero)) numero = numero.replace(/[.,]/g, "");
  else numero = numero.replace(",", ".");
  let n = Number(numero);
  if (!Number.isFinite(n)) return null;
  if (m[2]) n *= 1000;
  return n > 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null;
}

async function respuestaConProveedor(sb: SupabaseClient, respId: string) {
  const { data } = await sb
    .from("cotizaciones_especiales_respuestas")
    .select(
      "id, estado, precio, tiempo, incluye, tg_paso, cotizacion_especial_id, proveedores:proveedor_id ( id, nombre, telegram_chat_id ), cotizaciones_especiales:cotizacion_especial_id ( id, folio, titulo, estado, telefono_cliente )"
    )
    .eq("id", respId)
    .maybeSingle();
  return data as any;
}

function resumenRespuesta(r: { precio: number | null; tiempo: string; incluye: string }) {
  return (
    `💲 Precio: *${r.precio !== null ? pesos(Number(r.precio)) : "—"}*\n` +
    `⏱️ Tiempo: ${sinMarkdown(r.tiempo || "—")}\n` +
    `📋 Incluye: ${sinMarkdown(r.incluye || "—")}`
  );
}

/** Botones de la cotización especial. Devuelve true si el callback era de este módulo. */
export async function manejarCallbackCotizacionEspecial(sb: SupabaseClient, botToken: string, cb: any): Promise<boolean> {
  const m = String(cb.data || "").match(/^ce:(c|v|n|ok|ed|s):([0-9a-f-]{36})$/i);
  if (!m) return false;
  const [, accion, respId] = m;
  const chatId = String(cb.message?.chat?.id ?? cb.from?.id ?? "");
  const r = await respuestaConProveedor(sb, respId);
  const prov = r?.proveedores;
  const ce = r?.cotizaciones_especiales;

  if (!r || !prov || String(prov.telegram_chat_id) !== chatId) {
    await responderCallbackQueryTelegram(botToken, cb.id, "No pude identificar esta solicitud.", true);
    return true;
  }
  if (!ce || ["cerrada", "cancelada"].includes(ce.estado)) {
    await responderCallbackQueryTelegram(botToken, cb.id, "Esta solicitud ya no está activa.", true);
    return true;
  }

  const ahora = new Date().toISOString();
  const actualizar = (cambios: Record<string, unknown>) =>
    sb.from("cotizaciones_especiales_respuestas").update({ ...cambios, updated_at: ahora }).eq("id", respId);

  if (accion === "c" || accion === "ed") {
    await actualizar({ estado: "cotizando", tg_paso: "precio" });
    await responderCallbackQueryTelegram(botToken, cb.id, "Va 👍");
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: `💲 *${sinMarkdown(ce.folio)}* · ¿Cuál es tu *precio total* para SAUCEDA? Escribe solo la cantidad (ej. 18000 o 18 mil).`,
    });
    return true;
  }

  if (accion === "s") {
    if (r.tg_paso !== "incluye") {
      await responderCallbackQueryTelegram(botToken, cb.id, "Ese paso ya pasó.");
      return true;
    }
    await actualizar({ tg_paso: "confirmar" });
    await responderCallbackQueryTelegram(botToken, cb.id, "Listo");
    await pedirConfirmacion(botToken, chatId, ce.folio, respId, { precio: r.precio, tiempo: r.tiempo, incluye: "" });
    return true;
  }

  if (accion === "ok") {
    if (r.tg_paso !== "confirmar" || r.precio === null) {
      await responderCallbackQueryTelegram(botToken, cb.id, "Primero captura tu precio.", true);
      return true;
    }
    await actualizar({ estado: "cotizada", tg_paso: null, respondida_at: ahora });
    await responderCallbackQueryTelegram(botToken, cb.id, "¡Enviado!");
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: `✅ ¡Gracias, ${sinMarkdown(prov.nombre)}! Recibimos tu cotización de *${sinMarkdown(ce.folio)}*. Te avisamos si el cliente la acepta.`,
    });
    await prepararEstimacion(sb, ce.id);
    return true;
  }

  // v / n
  const visita = accion === "v";
  await actualizar({ estado: visita ? "requiere_visita" : "rechazada", tg_paso: null, respondida_at: ahora });
  await responderCallbackQueryTelegram(botToken, cb.id, visita ? "Anotado: necesitas visita" : "Anotado, gracias");
  await enviarMensajeTelegram({
    botToken,
    chatId,
    texto: visita
      ? `🔎 Anotado: para *${sinMarkdown(ce.folio)}* necesitas visita. Un asesor de SAUCEDA te contacta para coordinarla.`
      : `👍 Gracias por avisar. Quitamos *${sinMarkdown(ce.folio)}* de tu lista.`,
  });
  await avisarGrupo(
    sb,
    `${visita ? "🔎" : "✖"} *${sinMarkdown(prov.nombre)}* ${visita ? "necesita visita para cotizar" : "no hace"} *${sinMarkdown(ce.folio)}* — ${sinMarkdown(ce.titulo)}.`,
    { text: "Abrir conversación", url: linkConversacion(ce.telefono_cliente) }
  );
  return true;
}

async function pedirConfirmacion(
  botToken: string,
  chatId: string,
  folio: string,
  respId: string,
  r: { precio: number | null; tiempo: string; incluye: string }
) {
  await enviarMensajeTelegram({
    botToken,
    chatId,
    texto: `📄 *${sinMarkdown(folio)}* · Revisa tu cotización:\n\n${resumenRespuesta(r)}`,
    inlineKeyboard: [
      [
        { text: "✓ Enviar", callback_data: `ce:ok:${respId}` },
        { text: "✎ Corregir", callback_data: `ce:ed:${respId}` },
      ],
    ],
  });
}

/**
 * Texto que escribe el proveedor mientras cotiza (precio → tiempo → qué incluye).
 * Devuelve true si el chat tenía una cotización especial en curso.
 */
export async function manejarTextoCotizacionEspecial(
  sb: SupabaseClient,
  botToken: string,
  chatId: string,
  texto: string
): Promise<boolean> {
  const { data: provs } = await sb.from("proveedores").select("id").eq("telegram_chat_id", chatId);
  const ids = (provs || []).map((p: any) => p.id);
  if (ids.length === 0) return false;

  const { data: enCurso } = await sb
    .from("cotizaciones_especiales_respuestas")
    .select("id, tg_paso, precio, tiempo, incluye, cotizaciones_especiales:cotizacion_especial_id ( folio )")
    .in("proveedor_id", ids)
    .not("tg_paso", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);
  const r: any = enCurso?.[0];
  if (!r) return false;

  const folio = r.cotizaciones_especiales?.folio || "";
  const ahora = new Date().toISOString();
  const actualizar = (cambios: Record<string, unknown>) =>
    sb.from("cotizaciones_especiales_respuestas").update({ ...cambios, updated_at: ahora }).eq("id", r.id);
  const limpio = (texto || "").trim().slice(0, 1500);

  if (r.tg_paso === "precio") {
    const precio = interpretarPrecio(limpio);
    if (precio === null) {
      await enviarMensajeTelegram({ botToken, chatId, texto: "No entendí la cantidad 🙏 Escríbela solo con números, ej. *18000* o *18 mil*." });
      return true;
    }
    await actualizar({ precio, tg_paso: "tiempo" });
    await enviarMensajeTelegram({ botToken, chatId, texto: `⏱️ ¿Cuánto *tiempo* te toma? (ej. 2 días)` });
    return true;
  }
  if (r.tg_paso === "tiempo") {
    await actualizar({ tiempo: limpio.slice(0, 300), tg_paso: "incluye" });
    await enviarMensajeTelegram({
      botToken,
      chatId,
      texto: "📋 ¿Qué *incluye* y qué *no* incluye tu precio? (material, mano de obra, refacciones…)",
      inlineKeyboard: [[{ text: "Omitir", callback_data: `ce:s:${r.id}` }]],
    });
    return true;
  }
  if (r.tg_paso === "incluye") {
    await actualizar({ incluye: limpio, tg_paso: "confirmar" });
    await pedirConfirmacion(botToken, chatId, folio, r.id, { precio: r.precio, tiempo: r.tiempo, incluye: limpio });
    return true;
  }
  if (r.tg_paso === "confirmar") {
    await pedirConfirmacion(botToken, chatId, folio, r.id, { precio: r.precio, tiempo: r.tiempo, incluye: r.incluye });
    return true;
  }
  return false;
}

/** Margen objetivo: el "Servicio especial" de la línea de negocio, el general o 35%. */
export async function margenObjetivo(sb: SupabaseClient, tipoNegocio: string | null): Promise<number> {
  const { data } = await sb
    .from("productos_servicios")
    .select("id, tipo_negocio, margen_objetivo_pct")
    .eq("es_servicio_especial", true)
    .eq("activo", true);
  const lista = (data || []).filter((p: any) => p.margen_objetivo_pct !== null);
  const deLinea = tipoNegocio ? lista.find((p: any) => p.tipo_negocio === tipoNegocio) : null;
  const general = lista.find((p: any) => p.id === "ESP-GENERAL") || lista.find((p: any) => !p.tipo_negocio);
  return Number((deLinea || general)?.margen_objetivo_pct ?? MARGEN_RESPALDO);
}

/** Precio sugerido y rango a partir del costo del proveedor y el margen objetivo. */
export function calcularEstimacion(costo: number, margenPct: number) {
  const m = Math.min(Math.max(margenPct, 0), 95) / 100;
  const precio = centena(costo / (1 - m));
  return { precio, min: centena(precio * 0.95), max: centena(precio * 1.15) };
}

export function textoEstimacion(p: {
  titulo: string;
  descripcion: string;
  tiempo: string;
  incluye: string;
  min: number;
  max: number;
}): string {
  const propuesta = (p.incluye || p.descripcion || "").trim();
  return (
    `¡Hola! Ya tenemos una estimación para *${p.titulo}*.\n\n` +
    (propuesta ? `🔧 Lo que proponemos: ${propuesta}\n` : "") +
    (p.tiempo ? `⏱️ Tiempo estimado: ${p.tiempo}\n` : "") +
    `💰 Estimación: entre ${pesos(p.min)} y ${pesos(p.max)}\n\n` +
    `Es una estimación preliminar; el precio final lo confirmamos con una visita técnica. ¿Te gustaría que la agendemos?`
  );
}

/**
 * Prepara (o recalcula) la estimación con la respuesta elegida o, si no hay, la más barata.
 * Deja la cotización en "estimacion_lista" y avisa al grupo para que el asesor la apruebe.
 */
export async function prepararEstimacion(
  sb: SupabaseClient,
  ceId: string,
  opts?: { respuestaId?: string; avisar?: boolean }
): Promise<boolean> {
  const avisar = opts?.avisar !== false;
  const { data: ce } = await sb
    .from("cotizaciones_especiales")
    .select("id, folio, titulo, descripcion, tipo_negocio, estado, telefono_cliente, respuesta_elegida_id, margen_pct")
    .eq("id", ceId)
    .maybeSingle();
  if (!ce || ["enviada_cliente", "cerrada", "cancelada"].includes(ce.estado)) return false;

  const { data: cotizadas } = await sb
    .from("cotizaciones_especiales_respuestas")
    .select("id, precio, tiempo, incluye, proveedores:proveedor_id ( nombre )")
    .eq("cotizacion_especial_id", ceId)
    .eq("estado", "cotizada")
    .not("precio", "is", null)
    .order("precio", { ascending: true });
  if (!cotizadas || cotizadas.length === 0) return false;

  // Explícita → esa; recálculo del asesor → la que ya eligió; nueva respuesta de proveedor → la más barata.
  const objetivo = opts?.respuestaId ?? (avisar ? null : ce.respuesta_elegida_id);
  const elegida: any = cotizadas.find((c: any) => c.id === objetivo) || cotizadas[0];
  const margen = ce.margen_pct !== null && ce.margen_pct !== undefined ? Number(ce.margen_pct) : await margenObjetivo(sb, ce.tipo_negocio);
  const est = calcularEstimacion(Number(elegida.precio), margen);

  await sb
    .from("cotizaciones_especiales")
    .update({
      estado: "estimacion_lista",
      respuesta_elegida_id: elegida.id,
      margen_pct: margen,
      precio_sugerido: est.precio,
      rango_min: est.min,
      rango_max: est.max,
      estimacion_texto: textoEstimacion({
        titulo: ce.titulo,
        descripcion: ce.descripcion,
        tiempo: elegida.tiempo,
        incluye: elegida.incluye,
        min: est.min,
        max: est.max,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ceId);

  if (avisar) {
    await avisarGrupo(
      sb,
      `💡 *Estimación lista* ${sinMarkdown(ce.folio)} — ${sinMarkdown(ce.titulo)}\n` +
        `${sinMarkdown(elegida.proveedores?.nombre || "Proveedor")}: ${pesos(Number(elegida.precio))} · margen ${margen}% → ${pesos(est.min)}–${pesos(est.max)}\n` +
        `Revísala y envíala al cliente desde la conversación.`,
      { text: "Abrir conversación", url: linkConversacion(ce.telefono_cliente) }
    );
  }
  return true;
}
