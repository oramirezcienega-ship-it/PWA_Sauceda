import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefono } from "@/lib/telefono";
import { enviarWhatsAppPlantilla, enviarWhatsAppTexto } from "@/lib/whatsapp";

/**
 * Conversaciones con proveedores por la línea oficial de WhatsApp. Sus mensajes llevan
 * proveedor_id en mensajes_whatsapp: no entran a la bandeja de clientes, no crean
 * prospecto y Sofía no los contesta.
 *
 * WhatsApp solo deja mandar texto libre dentro de las 24 h siguientes al último mensaje
 * del proveedor. Fuera de esa ventana se manda la plantilla PLANTILLA_AVISO con un resumen
 * y el mensaje completo queda "pendiente_ventana": sale solo en cuanto el proveedor contesta.
 */

export const PLANTILLA_AVISO = "aviso_proveedor";
const IDIOMA_PLANTILLA = "es_MX";
const VENTANA_MS = 24 * 60 * 60 * 1000;
export const ESTADO_PENDIENTE_VENTANA = "pendiente_ventana";

export interface ProveedorWhatsApp {
  id: string;
  nombre: string;
  contactoNombre: string;
  telefono: string;
}

/** Proveedor activo con ese WhatsApp (o teléfono), comparando por los últimos 10 dígitos. */
export async function proveedorPorTelefono(sb: SupabaseClient, telefono: string): Promise<ProveedorWhatsApp | null> {
  const diez = normalizarTelefono(telefono).slice(-10);
  if (diez.length !== 10) return null;
  const { data } = await sb
    .from("proveedores")
    .select("id, nombre, contacto_nombre, whatsapp, telefono")
    .eq("activo", true)
    .or(`whatsapp.ilike.%${diez},telefono.ilike.%${diez}`);
  const p = (data || []).find((x: any) =>
    [x.whatsapp, x.telefono].some((t) => t && normalizarTelefono(t).slice(-10) === diez)
  ) as any;
  return p
    ? { id: p.id, nombre: p.nombre, contactoNombre: p.contacto_nombre || "", telefono: normalizarTelefono(p.whatsapp || p.telefono) }
    : null;
}

export async function datosProveedor(sb: SupabaseClient, proveedorId: string): Promise<ProveedorWhatsApp | null> {
  const { data: p } = await sb.from("proveedores").select("id, nombre, contacto_nombre, whatsapp, telefono").eq("id", proveedorId).maybeSingle();
  if (!p) return null;
  return { id: p.id, nombre: p.nombre, contactoNombre: p.contacto_nombre || "", telefono: normalizarTelefono(p.whatsapp || p.telefono || "") };
}

/** ¿El proveedor escribió en las últimas 24 h? (se le puede mandar texto libre) */
export async function ventanaAbiertaProveedor(sb: SupabaseClient, proveedorId: string): Promise<boolean> {
  const { data } = await sb
    .from("mensajes_whatsapp")
    .select("created_at")
    .eq("proveedor_id", proveedorId)
    .eq("direccion", "in")
    .order("created_at", { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.created_at;
  return Boolean(ultimo && Date.now() - new Date(ultimo).getTime() < VENTANA_MS - 5 * 60 * 1000);
}

function estadoDe(r: { ok: boolean; error?: string; errorDetail?: string }): string {
  return r.ok ? "enviado" : `error:${r.errorDetail || r.error || "desconocido"}`;
}

export interface ResultadoEnvioProveedor {
  ok: boolean;
  /** "texto": salió el mensaje completo; "plantilla": salió el aviso y el completo espera respuesta. */
  via?: "texto" | "plantilla";
  error?: string;
}

/**
 * Manda un mensaje al proveedor por la línea oficial y lo deja en su conversación.
 * `resumen` (una línea, sin saltos) es lo que va en la plantilla si la ventana está cerrada.
 */
export async function enviarWhatsAppProveedor(
  sb: SupabaseClient,
  d: { proveedorId: string; texto: string; resumen: string; agente?: string }
): Promise<ResultadoEnvioProveedor> {
  const prov = await datosProveedor(sb, d.proveedorId);
  if (!prov) return { ok: false, error: "Proveedor no encontrado." };
  if (!prov.telefono) return { ok: false, error: `${prov.nombre} no tiene WhatsApp registrado.` };
  const agente = d.agente || "";
  const texto = d.texto.trim();

  if (await ventanaAbiertaProveedor(sb, prov.id)) {
    const r = await enviarWhatsAppTexto(prov.telefono, texto);
    if (r.ok) {
      await sb.from("mensajes_whatsapp").insert({
        telefono: prov.telefono,
        texto,
        direccion: "out",
        proveedor_id: prov.id,
        estado: "enviado",
        agente,
        wa_message_id: r.messageId || null,
      });
      return { ok: true, via: "texto" };
    }
  }

  // Prioridad Proveedores / Rescate: Evolution API (Línea Móvil Secundaria sin restricción de 24 h)
  try {
    const { enviarMensajeTextoEvolution } = await import("@/lib/evolution-api");
    const evoRes = await enviarMensajeTextoEvolution(prov.telefono, texto);
    if (evoRes.ok) {
      await sb.from("mensajes_whatsapp").insert({
        telefono: prov.telefono,
        texto,
        direccion: "out",
        proveedor_id: prov.id,
        estado: "enviado",
        agente,
        wa_message_id: (evoRes as any).id || null,
      });
      return { ok: true, via: "texto" };
    }
  } catch (err) {
    console.warn("[WhatsApp proveedores] Falló envío por Evolution API, intentando plantilla Meta:", err);
  }

  // Fallback si Evolution no está disponible: aviso por plantilla Meta y el mensaje queda en espera
  const nombre = (prov.contactoNombre || prov.nombre).split(/\s+/)[0];
  const resumen = d.resumen.replace(/\s+/g, " ").trim().slice(0, 900) || "tienes un aviso nuevo";
  const r = await enviarWhatsAppPlantilla(prov.telefono, PLANTILLA_AVISO, IDIOMA_PLANTILLA, [nombre, resumen]);
  if (!r.ok) {
    return { ok: false, error: `No se pudo mandar el mensaje al proveedor por Evolution ni por plantilla Meta: ${r.errorDetail || r.error || "error"}` };
  }
  await sb.from("mensajes_whatsapp").insert([
    {
      telefono: prov.telefono,
      texto: `[Plantilla: ${PLANTILLA_AVISO}] Hola ${nombre}, ${resumen}`,
      direccion: "out",
      proveedor_id: prov.id,
      estado: "enviado",
      agente,
      wa_message_id: r.messageId || null,
    },
    {
      telefono: prov.telefono,
      texto,
      direccion: "out",
      proveedor_id: prov.id,
      estado: ESTADO_PENDIENTE_VENTANA,
      agente,
    },
  ]);
  return { ok: true, via: "plantilla" };
}

/** El proveedor contestó: salen, en orden, los mensajes que esperaban la ventana. */
export async function liberarPendientesProveedor(sb: SupabaseClient, proveedorId: string, telefono: string): Promise<number> {
  const { data } = await sb
    .from("mensajes_whatsapp")
    .select("id, texto")
    .eq("proveedor_id", proveedorId)
    .eq("estado", ESTADO_PENDIENTE_VENTANA)
    .order("created_at", { ascending: true });
  let enviados = 0;
  for (const m of data || []) {
    const r = await enviarWhatsAppTexto(telefono, m.texto);
    await sb
      .from("mensajes_whatsapp")
      .update({ estado: estadoDe(r), wa_message_id: r.messageId || null, created_at: new Date().toISOString() })
      .eq("id", m.id);
    if (r.ok) enviados++;
  }
  return enviados;
}

/**
 * Mensaje entrante de un proveedor: se guarda en su conversación (sin prospecto ni Sofía),
 * se liberan los pendientes y se avisa al grupo de Telegram.
 */
export async function registrarMensajeEntranteProveedor(
  sb: SupabaseClient,
  prov: ProveedorWhatsApp,
  m: { telefono: string; texto: string; waMessageId?: string }
): Promise<void> {
  const telefono = normalizarTelefono(m.telefono) || prov.telefono;
  const { error } = await sb.from("mensajes_whatsapp").insert({
    telefono,
    texto: m.texto,
    direccion: "in",
    proveedor_id: prov.id,
    wa_message_id: m.waMessageId ?? null,
  });
  if (error) return; // reintento de Meta: ya estaba guardado

  await liberarPendientesProveedor(sb, prov.id, telefono);

  try {
    const { obtenerConfiguracionTelegram, enviarMensajeTelegram } = await import("@/lib/telegram");
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    if (botToken && chatIdGrupo) {
      const base = (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
      await enviarMensajeTelegram({
        botToken,
        chatId: chatIdGrupo,
        texto: `📩 ${prov.nombre} (proveedor) escribió por WhatsApp:\n${m.texto.replace(/^\[audio:[^\]]+\]\s*/, "🎤 ").slice(0, 500)}`,
        inlineKeyboard: [[{ text: "Abrir conversación", url: `${base}/conversaciones?proveedor=${prov.id}` }]],
      });
    }
  } catch (err) {
    console.warn("[WhatsApp proveedores] No se pudo avisar por Telegram:", err);
  }
}
