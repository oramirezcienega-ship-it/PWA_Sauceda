"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { obtenerConfiguracionTelegram } from "@/lib/telegram";
import { enviarDocumentoTelegram } from "@/lib/telegram-envios";
import { registrarActividad } from "@/lib/actividades";
import {
  SERVICIOS,
  SLA_AUTORIZACION_CLAVE,
  armarPaqueteAutorizacion,
  enlaceVistoAutorizacion,
  obtenerSlaAutorizacionHoras,
  listarDestinatariosAutorizacion,
  type DestinatarioAutorizacion,
  type RegistroAutorizacionCosto,
} from "@/lib/cotizacion-telegram";

export interface EstadoAutorizacionCostos {
  ok: boolean;
  error?: string;
  /** Resumen tal como lo verá el destinatario en Telegram (HTML ya escapado). */
  html?: string;
  destinatarios: DestinatarioAutorizacion[];
  registros: Record<string, RegistroAutorizacionCosto>;
  /** Enlaces para vincular a un proveedor/usuario con el bot: clave -> URL. */
  enlaces: Record<string, string>;
}

const vacio = { destinatarios: [], registros: {}, enlaces: {} };

async function usernameBot(botToken: string): Promise<string> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const d = await r.json();
    return d?.result?.username || "";
  } catch {
    return "";
  }
}

/** Vista previa del mensaje, destinatarios disponibles y respuestas ya recibidas. */
export async function obtenerEstadoAutorizacionCostosAction(cotizacionId: string): Promise<EstadoAutorizacionCostos> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const paquete = await armarPaqueteAutorizacion(sb, cotizacionId);
    if (!paquete.ok) return { ok: false, error: paquete.error, ...vacio };

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    const bot = botToken ? await usernameBot(botToken) : "";
    const destinatarios = await listarDestinatariosAutorizacion(sb);
    const enlaces: Record<string, string> = {};
    if (bot) {
      for (const d of destinatarios) {
        if (!d.telegramChatId) enlaces[d.clave] = `https://t.me/${bot}?start=${d.tipo === "proveedor" ? `prov_${d.id}` : d.id}`;
      }
    }
    const { data: cot } = await sb.from("cotizaciones").select("autorizacion_costos").eq("id", cotizacionId).maybeSingle();
    return {
      ok: true,
      html: paquete.caption,
      destinatarios,
      registros: (cot?.autorizacion_costos as Record<string, RegistroAutorizacionCosto>) || {},
      enlaces,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al preparar el envío.", ...vacio };
  }
}

/** Envía por Telegram el PDF de la cotización y el resumen, con botones Autorizar / Rechazar. */
export async function enviarAutorizacionCostosAction(
  cotizacionId: string,
  claves: string[]
): Promise<{ ok: boolean; error?: string; enviados: { nombre: string; ok: boolean; error?: string }[] }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    if (claves.length === 0) return { ok: false, error: "Selecciona al menos un destinatario.", enviados: [] };

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return { ok: false, error: "El bot de Telegram no está configurado.", enviados: [] };

    const paquete = await armarPaqueteAutorizacion(sb, cotizacionId);
    if (!paquete.ok) return { ok: false, error: paquete.error, enviados: [] };

    const todos = await listarDestinatariosAutorizacion(sb);
    const elegidos = todos.filter((d) => claves.includes(d.clave));

    const { data: cot } = await sb.from("cotizaciones").select("autorizacion_costos, prospecto_id, expediente_id").eq("id", cotizacionId).maybeSingle();
    const registros: Record<string, RegistroAutorizacionCosto> = { ...((cot?.autorizacion_costos as any) || {}) };
    const enviados: { nombre: string; ok: boolean; error?: string }[] = [];

    for (const d of elegidos) {
      const ahora = new Date().toISOString();
      if (!d.telegramChatId) {
        registros[d.clave] = { nombre: d.nombre, tipo: d.tipo, ok: false, enviadoAt: ahora, error: "Sin Telegram vinculado", respuesta: null };
        enviados.push({ nombre: d.nombre, ok: false, error: "Sin Telegram vinculado" });
        continue;
      }
      const vistoToken = randomUUID();
      const r = await enviarDocumentoTelegram({
        botToken,
        chatId: d.telegramChatId,
        contenido: paquete.pdf,
        nombreArchivo: paquete.nombreArchivo,
        caption: paquete.caption,
        inlineKeyboard: [
          [{ text: "📄 Ver cotización", url: enlaceVistoAutorizacion(cotizacionId, vistoToken) }],
          [
            { text: "✅ Autorizar costo", callback_data: `k:${cotizacionId}:1` },
            { text: "❌ Rechazar", callback_data: `k:${cotizacionId}:0` },
          ],
        ],
      });
      registros[d.clave] = {
        nombre: d.nombre, tipo: d.tipo, ok: r.ok, enviadoAt: ahora, messageId: r.messageId,
        error: r.ok ? undefined : r.error, respuesta: null, respondidoAt: null,
        vistoToken, vistoAt: null,
      };
      enviados.push({ nombre: d.nombre, ok: r.ok, error: r.error });
    }

    await sb.from("cotizaciones").update({ autorizacion_costos: registros }).eq("id", cotizacionId);

    const okNombres = enviados.filter((e) => e.ok).map((e) => e.nombre);
    if (okNombres.length > 0) {
      await registrarActividad(sb, {
        prospectoId: cot?.prospecto_id,
        expedienteId: cot?.expediente_id || undefined,
        tipo: "construccion",
        titulo: `Cotización ${cotizacionId} enviada por Telegram para autorizar costo`,
        detalle: `Enviada a: ${okNombres.join(", ")}.`,
      });
    }
    revalidatePath(`/construccion/${cotizacionId}`);

    const algunoOk = okNombres.length > 0;
    return {
      ok: algunoOk,
      error: algunoOk ? undefined : enviados.map((e) => `${e.nombre}: ${e.error}`).join(" · ") || "No se pudo enviar.",
      enviados,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al enviar por Telegram.", enviados: [] };
  }
}

export interface AutorizacionProveedor {
  cotizacionId: string;
  cliente: string;
  servicio: string;
  estatusCotizacion: string;
  precioFinal: number;
  proveedor: string;
  /** Entregado = Telegram aceptó el mensaje; no_entregado = falló el envío (sin Telegram, bot bloqueado, etc.). */
  entrega: "entregado" | "no_entregado";
  estado: "esperando" | "autorizado" | "rechazado" | "error";
  enviadoAt: string;
  vistoAt: string | null;
  respondidoAt: string | null;
  /** Fecha límite para responder según el SLA vigente. */
  slaVenceAt: string;
  error?: string;
}

/** Todas las solicitudes de autorización de costo enviadas a proveedores, de todas las cotizaciones. */
export async function listarAutorizacionesProveedoresAction(): Promise<{ filas: AutorizacionProveedor[]; slaHoras: number }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const [{ data, error }, slaHoras] = await Promise.all([
    sb
      .from("cotizaciones")
      .select("id, servicio_tipo, estatus, precio_final, cliente_nombre_personalizado, autorizacion_costos, prospectos:prospecto_id(nombre, primer_apellido, segundo_apellido)")
      .not("autorizacion_costos", "is", null),
    obtenerSlaAutorizacionHoras(sb),
  ]);
  if (error) throw new Error(error.message);

  const filas: AutorizacionProveedor[] = [];
  for (const c of (data || []) as any[]) {
    const registros = (c.autorizacion_costos || {}) as Record<string, RegistroAutorizacionCosto>;
    const pros = Array.isArray(c.prospectos) ? c.prospectos[0] : c.prospectos;
    const cliente =
      c.cliente_nombre_personalizado?.trim() ||
      [pros?.nombre, pros?.primer_apellido, pros?.segundo_apellido].filter(Boolean).join(" ") ||
      "Cliente";
    for (const reg of Object.values(registros)) {
      if (reg?.tipo !== "proveedor") continue;
      filas.push({
        cotizacionId: c.id,
        cliente,
        servicio: SERVICIOS[c.servicio_tipo] || c.servicio_tipo || "—",
        estatusCotizacion: c.estatus,
        precioFinal: Number(c.precio_final || 0),
        proveedor: reg.nombre,
        entrega: reg.ok ? "entregado" : "no_entregado",
        estado: !reg.ok ? "error" : reg.respuesta === "autorizado" ? "autorizado" : reg.respuesta === "rechazado" ? "rechazado" : "esperando",
        enviadoAt: reg.enviadoAt,
        vistoAt: reg.vistoAt || null,
        respondidoAt: reg.respondidoAt || null,
        slaVenceAt: new Date(new Date(reg.enviadoAt).getTime() + slaHoras * 3_600_000).toISOString(),
        error: reg.error,
      });
    }
  }
  filas.sort((a, b) => a.enviadoAt.localeCompare(b.enviadoAt));
  return { filas, slaHoras };
}

/** Cambia las horas de SLA para que los proveedores respondan (aplica a todo el equipo). */
export async function guardarSlaAutorizacionAction(horas: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!Number.isFinite(horas) || horas <= 0 || horas > 720) {
      return { ok: false, error: "Indica un número de horas entre 1 y 720." };
    }
    const sb = supabaseServidor();
    const { error } = await sb
      .from("configuracion_agente")
      .upsert({ clave: SLA_AUTORIZACION_CLAVE, valor: String(horas) }, { onConflict: "clave" });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/proveedores");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo guardar el SLA." };
  }
}
