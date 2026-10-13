import type { SupabaseClient } from "@supabase/supabase-js";
import { generarTokenCarga } from "@/lib/asesoria/aliados";
import { costoUnitarioPorVolumen } from "@/lib/costos-volumen";
import { normalizarCostosCapacidad } from "@/lib/tarifas-capacidad";

/**
 * Motor de solicitudes de servicio a proveedores (migración 0151).
 *
 * cascada → un proveedor a la vez; si no responde dentro de su plazo o no puede,
 *           pasa al siguiente. urgente → a todos a la vez; gana el primero que acepta.
 * El proveedor nunca recibe datos del cliente: solo producto, descripción, cantidad,
 * zona, fotos, fechas posibles y su costo de referencia.
 */

export const ESTADOS_ENVIO_ACTIVOS = ["enviada", "vista"] as const;

const SITE_URL = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
export const linkPortalProveedor = (token: string) => `${SITE_URL()}/precios-proveedor/${token}`;

/** Costo de referencia del proveedor para esta cantidad según su oferta (por escalón, por volumen o unitario). */
export function costoReferenciaOferta(
  oferta: { costo_unitario: any; costos_volumen: any; tarifas_capacidad: any; monto_minimo?: any; cantidad_minima?: any },
  cantidad: number | null | undefined
): number | null {
  const cant = Number(cantidad || 0);
  const escalones = normalizarCostosCapacidad(oferta.tarifas_capacidad);
  if (escalones.length > 0) {
    if (!(cant > 0)) return null;
    const esc = escalones.find((e) => cant <= e.hastaLitros) ?? escalones[escalones.length - 1];
    return esc.costo;
  }
  const base = Number(oferta.costo_unitario || 0);
  if (!(base > 0)) return null;
  if (!(cant > 0)) return base;
  const cobrada = Math.max(cant, Number(oferta.cantidad_minima || 0));
  const total = costoUnitarioPorVolumen(oferta.costos_volumen as any, cobrada, base) * cobrada;
  return Math.round(Math.max(total, Number(oferta.monto_minimo || 0)) * 100) / 100;
}

/** Folio consecutivo anual: SOL-2026-0001. */
export async function siguienteFolioSolicitud(sb: SupabaseClient): Promise<string> {
  const prefijo = `SOL-${new Date().getFullYear()}-`;
  const { data } = await sb
    .from("solicitudes_proveedor")
    .select("folio")
    .ilike("folio", `${prefijo}%`)
    .order("folio", { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.folio ? parseInt(String(data[0].folio).replace(prefijo, ""), 10) : 0;
  return `${prefijo}${String((Number.isFinite(ultimo) ? ultimo : 0) + 1).padStart(4, "0")}`;
}

/** Token del link del proveedor (lo crea si no existe). */
async function tokenProveedor(sb: SupabaseClient, proveedorId: string): Promise<string | null> {
  const { data } = await sb.from("proveedores").select("token_precios").eq("id", proveedorId).maybeSingle();
  if (data?.token_precios) return data.token_precios;
  const token = generarTokenCarga(crypto.getRandomValues(new Uint8Array(32)));
  const { error } = await sb.from("proveedores").update({ token_precios: token }).eq("id", proveedorId);
  return error ? null : token;
}

const sinMarkdown = (t: string) => (t || "").replace(/[_*`[\]]/g, "");

async function avisarGrupo(sb: SupabaseClient, texto: string, botones?: { text: string; url: string }[]) {
  try {
    const { obtenerConfiguracionTelegram, enviarMensajeTelegram } = await import("@/lib/telegram");
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    if (!botToken || !chatIdGrupo) return;
    await enviarMensajeTelegram({
      botToken,
      chatId: chatIdGrupo,
      texto,
      parseMode: "Markdown",
      inlineKeyboard: botones && botones.length ? [botones] : undefined,
    });
  } catch (err) {
    console.warn("[solicitudes-proveedor] No se pudo avisar por Telegram:", err);
  }
}

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

/** Avisa al proveedor por WhatsApp (Evolution API); si no se puede, deja el aviso con botón en Telegram. */
async function notificarProveedor(sb: SupabaseClient, envioId: string) {
  const { data: envio, error: errEnvio } = await sb
    .from("solicitudes_proveedor_envios")
    .select(
      "id, fecha_limite, costo_referencia, proveedores:proveedor_id ( id, nombre, whatsapp, telefono ), solicitudes_proveedor:solicitud_id ( folio, descripcion, cantidad, unidad, zona, modo, productos_servicios:producto_id ( nombre ) )"
    )
    .eq("id", envioId)
    .maybeSingle();
  if (errEnvio) console.error("[solicitudes-proveedor] No se pudo leer el envío para notificar:", errEnvio.message);
  if (!envio) return;
  const prov: any = (envio as any).proveedores;
  const sol: any = (envio as any).solicitudes_proveedor;
  const prod: any = sol?.productos_servicios;
  const token = await tokenProveedor(sb, prov.id);
  if (!token) return;
  const link = linkPortalProveedor(token);

  const cantidadTxt =
    sol?.cantidad && Number(sol.cantidad) > 0 ? ` (${Number(sol.cantidad).toLocaleString("es-MX")} ${sol.unidad || ""})` : "";
  const mensaje =
    `Hola ${prov.nombre} 👋, SAUCEDA tiene un servicio para ti${sol?.modo === "urgente" ? " *URGENTE*" : ""}:\n\n` +
    `🔧 ${prod?.nombre || "Servicio"}${cantidadTxt}\n` +
    (sol?.zona ? `📍 Zona: ${sol.zona}\n` : "") +
    (sol?.descripcion ? `📝 ${String(sol.descripcion).slice(0, 300)}\n` : "") +
    `\n¿Lo puedes tomar? Revisa fotos y detalles y responde aquí antes del ${fechaLimiteTexto(envio.fecha_limite)}:\n${link}\n\nFolio: ${sol?.folio}`;

  const telefono = prov.whatsapp || prov.telefono;
  let enviado = false;
  if (telefono) {
    try {
      const { enviarMensajeTextoEvolution } = await import("@/lib/evolution-api");
      const r = await enviarMensajeTextoEvolution(telefono, mensaje);
      enviado = r.ok;
    } catch {
      enviado = false;
    }
  }
  await sb.from("solicitudes_proveedor_envios").update({ notificado: enviado }).eq("id", envioId);

  if (!enviado) {
    const digitos = String(telefono || "").replace(/\D/g, "");
    const tel = digitos.length === 10 ? `52${digitos}` : digitos;
    await avisarGrupo(
      sb,
      `📨 Solicitud *${sinMarkdown(sol?.folio)}*: avisa a *${sinMarkdown(prov.nombre)}* (no se pudo enviar el WhatsApp automático).`,
      tel ? [{ text: `WhatsApp a ${prov.nombre}`.slice(0, 60), url: `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}` }] : undefined
    );
  }
}

/** Activa (envía) un envío en espera: fecha límite = ahora + horas de respuesta. */
async function activarEnvio(sb: SupabaseClient, envioId: string, horas: number) {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + Math.max(0.25, horas) * 3600 * 1000);
  const { data } = await sb
    .from("solicitudes_proveedor_envios")
    .update({ estado: "enviada", enviada_at: ahora.toISOString(), fecha_limite: limite.toISOString(), updated_at: ahora.toISOString() })
    .eq("id", envioId)
    .eq("estado", "en_espera")
    .select("id")
    .maybeSingle();
  if (data) await notificarProveedor(sb, envioId);
}

/**
 * Pone al día una solicitud abierta: vence los envíos sin respuesta y, en cascada,
 * manda al siguiente proveedor. Si ya nadie queda, la marca "sin_proveedor".
 */
export async function avanzarSolicitud(sb: SupabaseClient, solicitudId: string): Promise<void> {
  const { data: sol } = await sb
    .from("solicitudes_proveedor")
    .select("id, folio, estado, modo, horas_respuesta")
    .eq("id", solicitudId)
    .maybeSingle();
  if (!sol || sol.estado !== "abierta") return;

  const ahora = new Date().toISOString();
  await sb
    .from("solicitudes_proveedor_envios")
    .update({ estado: "vencida", updated_at: ahora })
    .eq("solicitud_id", solicitudId)
    .in("estado", ESTADOS_ENVIO_ACTIVOS as unknown as string[])
    .lt("fecha_limite", ahora);

  const { data: envios } = await sb
    .from("solicitudes_proveedor_envios")
    .select("id, estado, orden")
    .eq("solicitud_id", solicitudId)
    .order("orden", { ascending: true });
  const lista = envios || [];
  const activos = lista.filter((e: any) => (ESTADOS_ENVIO_ACTIVOS as readonly string[]).includes(e.estado));
  const enEspera = lista.filter((e: any) => e.estado === "en_espera");

  if (sol.modo === "cascada" && activos.length === 0 && enEspera.length > 0) {
    await activarEnvio(sb, enEspera[0].id, Number(sol.horas_respuesta || 4));
    return;
  }

  if (activos.length === 0 && enEspera.length === 0) {
    const { data: cambio } = await sb
      .from("solicitudes_proveedor")
      .update({ estado: "sin_proveedor", updated_at: ahora })
      .eq("id", solicitudId)
      .eq("estado", "abierta")
      .select("id")
      .maybeSingle();
    if (cambio) {
      await avisarGrupo(
        sb,
        `⚠️ Solicitud *${sinMarkdown(sol.folio)}*: ningún proveedor la aceptó. Revisa en el CRM si la reenvías o buscas otro proveedor.`
      );
    }
  }
}

/** Arranca una solicitud recién creada: urgente → todos; cascada → el primero. */
export async function iniciarSolicitud(sb: SupabaseClient, solicitudId: string): Promise<void> {
  const { data: sol } = await sb.from("solicitudes_proveedor").select("modo, horas_respuesta").eq("id", solicitudId).maybeSingle();
  if (!sol) return;
  const { data: envios } = await sb
    .from("solicitudes_proveedor_envios")
    .select("id")
    .eq("solicitud_id", solicitudId)
    .eq("estado", "en_espera")
    .order("orden", { ascending: true });
  const horas = Number(sol.horas_respuesta || 4);
  const aActivar = sol.modo === "urgente" ? envios || [] : (envios || []).slice(0, 1);
  for (const e of aActivar) await activarEnvio(sb, e.id, horas);
}

/** Para el cron: pone al día todas las solicitudes abiertas. */
export async function avanzarSolicitudesAbiertas(sb: SupabaseClient): Promise<number> {
  const { data } = await sb.from("solicitudes_proveedor").select("id").eq("estado", "abierta").limit(200);
  for (const s of data || []) await avanzarSolicitud(sb, s.id);
  return (data || []).length;
}

export { avisarGrupo as avisarGrupoSolicitudes, sinMarkdown as sinMarkdownSolicitudes };
