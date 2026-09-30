import type { SupabaseClient } from "@supabase/supabase-js";
import { labelTipoNegocio } from "@/lib/types";

/** Escapa texto de usuario para el HTML de Telegram / vista previa. */
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

export interface EnvioTelegramAsesor {
  nombre: string;
  ok: boolean;
  enviadoAt: string;
  messageId?: number;
  error?: string;
  enteradoAt?: string | null;
  enteradoVia?: "telegram" | "manual" | null;
}

export interface InformacionInspeccion {
  /** Mensaje en HTML de Telegram (solo <b>, <i> y <a>; el texto de usuario va escapado). */
  html: string;
  fotosUrls: string[];
  fotosOmitidas: number;
  lineasMedidas: string[];
  destinatarios: { id: string; nombre: string; telegramChatId: string | null }[];
}

/** Arma la información completa de una inspección programada para compartirla con el asesor. */
export async function armarInformacionInspeccion(
  sb: SupabaseClient,
  citaId: string
): Promise<{ ok: boolean; error?: string; info?: InformacionInspeccion }> {
  const { data: cita } = await sb.from("agenda_citas").select("*").eq("id", citaId).maybeSingle();
  if (!cita) return { ok: false, error: "No se encontró la cita." };

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
  const tipoInspeccion =
    coord?.servicio_nombre || (cita.servicio_tipo ? labelTipoNegocio(cita.servicio_tipo) : "Inspección técnica");

  const linkMaps: string = exp?.link_google_maps || "";
  const consultaMapa = [direccion, colonia, "León, Guanajuato"].filter(Boolean).join(", ");
  const linkBuscar = consultaMapa
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consultaMapa)}`
    : "";

  // Medidas y fotos iniciales (último reporte de visita de las cotizaciones del prospecto)
  let lineasMedidas: string[] = [];
  let todasFotos: string[] = [];
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
        todasFotos = (Array.isArray(rep.fotos) ? rep.fotos : [])
          .map((f: any) => (typeof f === "string" ? f : f?.url))
          .filter(Boolean);
      }
    }
  }
  const fotosUrls = todasFotos.filter((u) => /^https?:\/\//i.test(u)).slice(0, 10);
  const fotosOmitidas = todasFotos.length - fotosUrls.length;

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
  if (fotosUrls.length > 0) {
    partes.push("", `📷 <b>Fotos iniciales:</b> ${fotosUrls.length} (se envían a continuación)`);
  }
  const html = partes.filter((p, i, a) => !(p === "" && a[i - 1] === "")).join("\n");

  // Asesores asignados a la visita
  const asignados: string[] =
    Array.isArray(cita.asignados_ids) && cita.asignados_ids.length > 0
      ? cita.asignados_ids
      : cita.perfil_id
      ? [cita.perfil_id]
      : [];
  if (asignados.length === 0) return { ok: false, error: "La cita no tiene asesor asignado." };

  const { data: perfiles } = await sb.from("perfiles").select("id, nombre, telegram_chat_id").in("id", asignados);

  return {
    ok: true,
    info: {
      html,
      fotosUrls,
      fotosOmitidas,
      lineasMedidas,
      destinatarios: (perfiles || []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        telegramChatId: p.telegram_chat_id || null,
      })),
    },
  };
}

/** Guarda el resultado del envío por asesor en agenda_citas.telegram_compartido. */
export async function guardarEnviosTelegramCita(
  sb: SupabaseClient,
  citaId: string,
  envios: Record<string, EnvioTelegramAsesor>
): Promise<void> {
  const { data: cita } = await sb.from("agenda_citas").select("telegram_compartido").eq("id", citaId).maybeSingle();
  const actual = (cita?.telegram_compartido as Record<string, EnvioTelegramAsesor>) || {};
  const nuevo: Record<string, EnvioTelegramAsesor> = { ...actual };
  for (const [perfilId, e] of Object.entries(envios)) {
    // Un reenvío reinicia la confirmación de lectura del mensaje anterior
    nuevo[perfilId] = { ...e, enteradoAt: null, enteradoVia: null };
  }
  await sb.from("agenda_citas").update({ telegram_compartido: nuevo }).eq("id", citaId);
}

/** Marca que el asesor leyó la información de la inspección (botón "Enterado" o marca manual). */
export async function marcarCitaEnteradaTelegram(
  sb: SupabaseClient,
  citaId: string,
  perfilId: string,
  via: "telegram" | "manual"
): Promise<{ ok: boolean; error?: string }> {
  const { data: cita } = await sb.from("agenda_citas").select("telegram_compartido").eq("id", citaId).maybeSingle();
  if (!cita) return { ok: false, error: "Cita no encontrada." };
  const compartido = (cita.telegram_compartido as Record<string, EnvioTelegramAsesor>) || {};
  const e = compartido[perfilId];
  if (!e) return { ok: false, error: "A este asesor no se le ha compartido la inspección." };
  if (!e.enteradoAt) {
    compartido[perfilId] = { ...e, enteradoAt: new Date().toISOString(), enteradoVia: via };
    await sb.from("agenda_citas").update({ telegram_compartido: compartido }).eq("id", citaId);
  }
  return { ok: true };
}
