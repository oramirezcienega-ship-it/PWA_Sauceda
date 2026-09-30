"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";
import { enviarFotosTelegram } from "@/lib/telegram-envios";
import { labelTipoNegocio } from "@/lib/types";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function fechaLarga(f: string): string {
  const [y, m, d] = (f || "").slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return f;
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Aplana las medidas (objeto libre) a líneas "Etiqueta: valor". */
function medidasATexto(medidas: any): string[] {
  if (!medidas || typeof medidas !== "object") return [];
  const lineas: string[] = [];
  for (const [k, v] of Object.entries(medidas)) {
    if (k === "rotaciones") continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object") continue;
    lineas.push(`${k.replace(/_/g, " ")}: ${v}`);
  }
  return lineas.slice(0, 12);
}

export interface ResultadoCompartirInspeccion {
  ok: boolean;
  error?: string;
  enviados: { nombre: string; ok: boolean; error?: string }[];
  /** Asesores asignados a los que no se les pudo escribir (sin Telegram vinculado). */
  sinTelegram: string[];
  fotosEnviadas: number;
}

/**
 * Comparte por Telegram con el/los asesor(es) asignados a una inspección
 * programada toda la información de la visita: cliente, dirección, colonia,
 * teléfono, ubicación de Google Maps, tipo de inspección y de negocio, fecha
 * y hora, y las medidas y fotos iniciales si existen.
 */
export async function compartirInspeccionPorTelegramAction(citaId: string): Promise<ResultadoCompartirInspeccion> {
  const vacio = { enviados: [], sinTelegram: [], fotosEnviadas: 0 };
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return { ok: false, error: "El bot de Telegram no está configurado.", ...vacio };

    const { data: cita } = await sb.from("agenda_citas").select("*").eq("id", citaId).maybeSingle();
    if (!cita) return { ok: false, error: "No se encontró la cita.", ...vacio };

    // Contexto del cliente
    const [{ data: exp }, { data: pros }, { data: coord }] = await Promise.all([
      cita.expediente_id
        ? sb.from("expedientes").select("*").eq("id", cita.expediente_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      cita.prospecto_id
        ? sb.from("prospectos").select("*").eq("id", cita.prospecto_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      sb.from("coordinaciones_inspeccion").select("servicio_nombre, detalles_tecnicos").eq("cita_id", citaId).maybeSingle(),
    ]);

    const colonia = cita.fraccionamiento || exp?.fraccionamiento || "";
    const direccion = exp?.direccion_propiedad || cita.direccion || pros?.direccion || "";
    const telefono = cita.cliente_telefono || pros?.telefono || "";
    const tipoNegocioRaw = exp?.tipo_negocio || pros?.tipo_negocio_principal || cita.servicio_tipo || "";
    const tipoNegocio = tipoNegocioRaw ? labelTipoNegocio(tipoNegocioRaw) : "";
    const tipoInspeccion = coord?.servicio_nombre || (cita.servicio_tipo ? labelTipoNegocio(cita.servicio_tipo) : "Inspección técnica");

    const linkMaps: string = exp?.link_google_maps || "";
    const consultaMapa = [direccion, colonia, "León, Guanajuato"].filter(Boolean).join(", ");
    const linkBuscar = consultaMapa
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consultaMapa)}`
      : "";

    // Medidas y fotos iniciales (reporte de visita de las cotizaciones del prospecto)
    let lineasMedidas: string[] = [];
    let urlsFotos: string[] = [];
    if (cita.prospecto_id) {
      const { data: cots } = await sb.from("cotizaciones").select("id").eq("prospecto_id", cita.prospecto_id);
      const ids = (cots || []).map((c: any) => c.id);
      if (ids.length > 0) {
        const { data: reps } = await sb
          .from("visitas_reportes")
          .select("medidas, fotos")
          .in("cotizacion_id", ids)
          .order("created_at", { ascending: false })
          .limit(1);
        const rep = reps?.[0];
        if (rep) {
          lineasMedidas = medidasATexto(rep.medidas);
          urlsFotos = (Array.isArray(rep.fotos) ? rep.fotos : [])
            .map((f: any) => (typeof f === "string" ? f : f?.url))
            .filter(Boolean);
        }
      }
    }

    // Mensaje (HTML de Telegram)
    const hora = `${String(cita.hora_inicio || "").slice(0, 5)}${cita.hora_fin ? ` a ${String(cita.hora_fin).slice(0, 5)}` : ""} hrs`;
    const partes: string[] = [
      `🔍 <b>INSPECCIÓN PROGRAMADA</b>`,
      ``,
      `📅 <b>Fecha:</b> ${esc(fechaLarga(cita.fecha))}`,
      `⏰ <b>Hora:</b> ${esc(hora)}`,
      ``,
      `👤 <b>Cliente:</b> ${esc(cita.cliente_nombre)}`,
      telefono ? `📞 <b>Teléfono:</b> ${esc(telefono)}` : "",
      direccion ? `🏠 <b>Dirección:</b> ${esc(direccion)}` : "",
      colonia ? `📍 <b>Colonia / Fraccionamiento:</b> ${esc(colonia)}` : "",
      linkMaps
        ? `🗺️ <b>Ubicación:</b> <a href="${esc(linkMaps)}">Abrir en Google Maps</a>`
        : linkBuscar
        ? `🗺️ <b>Mapa:</b> <a href="${esc(linkBuscar)}">Buscar la dirección en Google Maps</a> <i>(aproximado)</i>`
        : "",
      ``,
      `🛠️ <b>Tipo de inspección:</b> ${esc(tipoInspeccion)}`,
      tipoNegocio ? `💼 <b>Tipo de negocio:</b> ${esc(tipoNegocio)}` : "",
      coord?.detalles_tecnicos ? `📝 <b>Detalle:</b> ${esc(coord.detalles_tecnicos)}` : "",
      cita.notas ? `🗒️ <b>Notas de la cita:</b> ${esc(cita.notas)}` : "",
    ];
    if (lineasMedidas.length > 0) {
      partes.push("", `📐 <b>Medidas registradas:</b>`, ...lineasMedidas.map((l) => `• ${esc(l)}`));
    }
    if (urlsFotos.length > 0) {
      partes.push("", `📷 <b>Fotos iniciales:</b> ${urlsFotos.length} (a continuación)`);
    }
    const texto = partes.filter((p, i, a) => !(p === "" && a[i - 1] === "")).join("\n");

    // Asesores asignados a la visita
    const asignados: string[] = Array.isArray(cita.asignados_ids) && cita.asignados_ids.length > 0
      ? cita.asignados_ids
      : cita.perfil_id
      ? [cita.perfil_id]
      : [];
    if (asignados.length === 0) return { ok: false, error: "La cita no tiene asesor asignado.", ...vacio };

    const { data: perfiles } = await sb.from("perfiles").select("id, nombre, telegram_chat_id").in("id", asignados);

    const enviados: { nombre: string; ok: boolean; error?: string }[] = [];
    const sinTelegram: string[] = [];
    let fotosEnviadas = 0;

    for (const p of perfiles || []) {
      if (!p.telegram_chat_id) {
        sinTelegram.push(p.nombre);
        continue;
      }
      const r = await enviarMensajeTelegram({
        botToken,
        chatId: p.telegram_chat_id,
        texto,
        parseMode: "HTML",
      });
      enviados.push({ nombre: p.nombre, ok: r.ok, error: r.ok ? undefined : r.error });

      if (r.ok && urlsFotos.length > 0) {
        const f = await enviarFotosTelegram({ botToken, chatId: p.telegram_chat_id, urls: urlsFotos });
        fotosEnviadas += f.enviadas;
      }
    }

    const algunoOk = enviados.some((e) => e.ok);
    return {
      ok: algunoOk,
      error: algunoOk
        ? undefined
        : sinTelegram.length > 0
        ? `No se pudo enviar: ${sinTelegram.join(", ")} no tiene Telegram vinculado.`
        : "No se pudo enviar el mensaje por Telegram.",
      enviados,
      sinTelegram,
      fotosEnviadas,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al compartir la inspección.", ...vacio };
  }
}
