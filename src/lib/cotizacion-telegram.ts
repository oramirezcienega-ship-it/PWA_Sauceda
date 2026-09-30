import type { SupabaseClient } from "@supabase/supabase-js";
import { aCotizacion, aCotizacionConcepto } from "@/lib/cotizacionesMappers";
import { generarPdfCotizacion } from "@/lib/cotizacionPdf";
import { formatoPesos } from "@/lib/formato";
import type { CotizacionConcepto } from "@/lib/types";

/** Escapa texto de usuario para el HTML de Telegram. */
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface RegistroAutorizacionCosto {
  nombre: string;
  tipo: "proveedor" | "asesor";
  ok: boolean;
  enviadoAt: string;
  messageId?: number;
  error?: string;
  respuesta?: "autorizado" | "rechazado" | null;
  respondidoAt?: string | null;
}

export type DestinatarioAutorizacion = {
  /** "prov:<uuid>" o "perf:<uuid>" */
  clave: string;
  id: string;
  tipo: "proveedor" | "asesor";
  nombre: string;
  detalle: string;
  telegramChatId: string | null;
};

const SERVICIOS: Record<string, string> = {
  impermeabilizacion: "Impermeabilización",
  pintura: "Pintura y acabados",
  losa: "Construcción de losa",
  remodelacion: "Remodelación",
  herreria: "Herrería",
  piso_estampado: "Piso estampado",
};

/** Arma el PDF (el mismo que ve el cliente) y el resumen con los valores clave. */
export async function armarPaqueteAutorizacion(sb: SupabaseClient, cotizacionId: string) {
  const { data: fila } = await sb
    .from("cotizaciones")
    .select(`*, prospectos:prospecto_id(id, nombre, primer_apellido, segundo_apellido, correo, telefono, direccion)`)
    .eq("id", cotizacionId)
    .single();
  if (!fila) return { ok: false as const, error: "No se encontró la cotización." };

  const cotizacion = aCotizacion(fila);
  const { data: concFilas } = await sb
    .from("cotizacion_conceptos")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .order("created_at", { ascending: true });
  const conceptos: CotizacionConcepto[] = (concFilas || []).map(aCotizacionConcepto);

  const { data: rep } = await sb.from("visitas_reportes").select("id").eq("cotizacion_id", cotizacionId).maybeSingle();
  const siteUrl = process.env.SITE_URL || "https://crm.saucedamx.com";
  const pdf = Buffer.from(generarPdfCotizacion(cotizacion, conceptos, siteUrl, Boolean(rep)).output("arraybuffer"));

  const totalConceptos = conceptos.reduce((a, c) => a + (c.importe || 0), 0);
  const precio = cotizacion.precioFinal > 0 ? cotizacion.precioFinal : totalConceptos;
  const costo = cotizacion.costoEstimado || 0;
  const utilidad = precio - costo;
  const margen = precio > 0 ? (utilidad / precio) * 100 : 0;

  let asesorNombre = "";
  if (cotizacion.expedienteId) {
    const { data: exp } = await sb.from("expedientes").select("asesor_id, direccion_propiedad, fraccionamiento").eq("id", cotizacion.expedienteId).maybeSingle();
    if (exp?.asesor_id) {
      const { data: p } = await sb.from("perfiles").select("nombre").eq("id", exp.asesor_id).maybeSingle();
      asesorNombre = p?.nombre || "";
    }
  }

  const principales = [...conceptos].sort((a, b) => (b.importe || 0) - (a.importe || 0)).slice(0, 5);
  const lineas: string[] = [
    `🔐 <b>AUTORIZACIÓN DE COSTO · ${esc(cotizacion.id)}</b>`,
    ``,
    `🛠️ <b>Servicio:</b> ${esc(SERVICIOS[cotizacion.servicioTipo] || cotizacion.servicioTipo)}`,
    `👤 <b>Cliente:</b> ${esc(cotizacion.prospectoNombre || "—")}`,
    cotizacion.prospectoDireccion ? `📍 <b>Ubicación:</b> ${esc(cotizacion.prospectoDireccion)}` : "",
    asesorNombre ? `🧑‍💼 <b>Asesor comercial:</b> ${esc(asesorNombre)}` : "",
    ``,
    `💰 <b>Precio al cliente:</b> ${esc(formatoPesos(precio))}`,
    costo > 0 ? `🧾 <b>Costo estimado:</b> ${esc(formatoPesos(costo))}` : "",
    costo > 0 ? `📈 <b>Utilidad:</b> ${esc(formatoPesos(utilidad))} (${margen.toFixed(1)}%)` : "",
  ];
  if (principales.length > 0) {
    lineas.push(``, `📋 <b>Conceptos principales (${conceptos.length}):</b>`);
    for (const c of principales) {
      lineas.push(`• ${esc(String(c.descripcion).slice(0, 60))} — ${esc(formatoPesos(c.importe || 0))}`);
    }
  }
  lineas.push(``, `📎 Detalle completo en el PDF adjunto.`, `¿Autorizas el costo?`);
  const caption = lineas.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  return {
    ok: true as const,
    cotizacion,
    pdf,
    nombreArchivo: `Cotizacion-${cotizacion.id}.pdf`,
    caption: caption.length > 1024 ? caption.slice(0, 1000) + "…" : caption,
    resumen: { precio, costo, utilidad, margen, asesorNombre },
  };
}

/** Proveedores activos y usuarios (asesores/admin) a quienes se puede pedir la autorización. */
export async function listarDestinatariosAutorizacion(sb: SupabaseClient): Promise<DestinatarioAutorizacion[]> {
  const [{ data: provs }, { data: perfs }] = await Promise.all([
    sb.from("proveedores").select("id, nombre, categoria, telegram_chat_id").eq("activo", true).order("nombre"),
    sb.from("perfiles").select("id, nombre, rol, telegram_chat_id").eq("activo", true).order("nombre"),
  ]);
  return [
    ...(provs || []).map((p: any) => ({
      clave: `prov:${p.id}`, id: p.id, tipo: "proveedor" as const, nombre: p.nombre,
      detalle: p.categoria || "Proveedor", telegramChatId: p.telegram_chat_id || null,
    })),
    ...(perfs || []).map((p: any) => ({
      clave: `perf:${p.id}`, id: p.id, tipo: "asesor" as const, nombre: p.nombre,
      detalle: p.rol || "Usuario", telegramChatId: p.telegram_chat_id || null,
    })),
  ];
}

/** Registra la respuesta (botón Autorizar/Rechazar) de un destinatario. */
export async function registrarRespuestaAutorizacion(
  sb: SupabaseClient,
  cotizacionId: string,
  clave: string,
  respuesta: "autorizado" | "rechazado"
): Promise<{ ok: boolean; registro?: RegistroAutorizacionCosto }> {
  const { data: cot } = await sb.from("cotizaciones").select("autorizacion_costos").eq("id", cotizacionId).maybeSingle();
  const actual = (cot?.autorizacion_costos as Record<string, RegistroAutorizacionCosto>) || {};
  const reg = actual[clave];
  if (!reg) return { ok: false };
  actual[clave] = { ...reg, respuesta, respondidoAt: new Date().toISOString() };
  await sb.from("cotizaciones").update({ autorizacion_costos: actual }).eq("id", cotizacionId);
  return { ok: true, registro: actual[clave] };
}
