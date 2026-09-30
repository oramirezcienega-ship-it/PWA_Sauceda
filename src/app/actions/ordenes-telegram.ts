"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";
import { enviarDocumentoTelegram } from "@/lib/telegram-envios";
import { registrarActividad } from "@/lib/actividades";
import { formatoPesos } from "@/lib/formato";
import { labelTipoNegocio } from "@/lib/types";
import { obtenerOrdenTrabajoPorId } from "@/app/actions/ordenes-trabajo";
import { armarPaqueteAutorizacion } from "@/lib/cotizacion-telegram";
import { generarPdfPolizaGarantia, generarPdfRecibo } from "@/lib/pdfDocumentosOT";
import { pdfsDesdeVistas, type VistaPdf } from "@/lib/pdf-desde-vista";

/** Escapa texto de usuario para el HTML de Telegram. */
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fechaLarga = (f?: string | null) => {
  if (!f) return "Por definir";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f}T12:00:00` : f);
  return Number.isNaN(d.getTime())
    ? "Por definir"
    : d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

const ESTATUS: Record<string, string> = {
  pendiente: "⏳ Pendiente",
  en_proceso: "⚙️ En proceso",
  completada: "✅ Completada",
  cancelada: "🚫 Cancelada",
};

const siteUrl = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");

export interface DocumentoOTDisponible {
  clave: string;
  nombre: string;
  detalle: string;
}

export interface DestinatarioOT {
  id: string;
  nombre: string;
  rol: string;
  tieneTelegram: boolean;
  /** Es el asesor ejecutor o responsable de la orden. */
  preseleccionado: boolean;
  enlaceVinculacion?: string;
}

export interface EstadoEnvioOTTelegram {
  ok: boolean;
  error?: string;
  /** Resumen tal como lo verá el asesor (HTML de Telegram ya escapado). */
  html?: string;
  documentos: DocumentoOTDisponible[];
  destinatarios: DestinatarioOT[];
}

type Bloque = {
  clave: string;
  nombre: string;
  detalle: string;
  /** Página pública que se imprime normalmente: de ahí sale el PDF idéntico (Chromium). */
  vista?: VistaPdf;
  /** PDF de respaldo (jsPDF) si no se puede generar desde la página. */
  archivo: () => Promise<{ buffer: Buffer; nombreArchivo: string } | null>;
  /** Nombre del archivo cuando se genera desde la página. */
  nombreArchivo?: string;
};

const limpiarNombre = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-");

/** Carga la orden y arma el resumen + la lista de documentos que se pueden enviar. */
async function armarPaqueteOT(ordenId: string) {
  const sb = supabaseServidor();
  const { orden, recibos, garantia } = await obtenerOrdenTrabajoPorId(ordenId);
  if (!orden) return null;

  // Próxima cita de instalación agendada (si existe)
  let instalacion = "";
  try {
    let q = sb
      .from("agenda_citas")
      .select("fecha, hora_inicio, hora_fin, estado")
      .eq("tipo_cita", "instalacion")
      .neq("estado", "cancelada")
      .order("fecha", { ascending: false })
      .limit(1);
    if (orden.expedienteId && orden.prospectoId) q = q.or(`expediente_id.eq.${orden.expedienteId},prospecto_id.eq.${orden.prospectoId}`);
    else if (orden.expedienteId) q = q.eq("expediente_id", orden.expedienteId);
    else if (orden.prospectoId) q = q.eq("prospecto_id", orden.prospectoId);
    const { data: citas } = await q;
    const c = citas?.[0];
    if (c) instalacion = `${fechaLarga(c.fecha)}, ${String(c.hora_inicio).slice(0, 5)} a ${String(c.hora_fin).slice(0, 5)} hrs`;
  } catch {
    /* sin cita */
  }

  const direccion = orden.clienteDireccion || "";
  const mapa = direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${direccion}, León, Guanajuato`)}`
    : "";

  const bloques: Bloque[] = [];

  if (orden.cotizacionId) {
    bloques.push({
      clave: "cotizacion",
      nombre: `Cotización ${orden.cotizacionId}`,
      detalle: orden.totalCotizado ? `Total ${formatoPesos(orden.totalCotizado)}` : "Propuesta del cliente",
      vista: orden.cotizacionToken
        ? {
            ruta: `/cotizacion/${orden.cotizacionToken}?vista=documento&imprimir=1`,
            textosDeError: ["aún no está disponible", "no está disponible para su visualización"],
          }
        : undefined,
      nombreArchivo: `${limpiarNombre(`Propuesta Comercial ${orden.cotizacionId} - ${orden.clienteNombre || "Cliente"}`)}.pdf`,
      archivo: async () => {
        const p = await armarPaqueteAutorizacion(sb, orden.cotizacionId as string);
        if (!p.ok) return null;
        return {
          buffer: p.pdf,
          nombreArchivo: `${limpiarNombre(`Cotización ${p.cotizacion.id} - ${p.cotizacion.prospectoNombre || orden.clienteNombre || "Cliente"}`)}.pdf`,
        };
      },
    });
  }

  if (garantia) {
    bloques.push({
      clave: "garantia",
      nombre: "Póliza de garantía",
      detalle: `${garantia.anosGarantia} años de cobertura`,
      vista: garantia.token ? { ruta: `/garantia/${garantia.token}`, unaHoja: true } : undefined,
      nombreArchivo: `${limpiarNombre(`Póliza de garantía - ${orden.clienteNombre || "Cliente"} - ${orden.folio}`)}.pdf`,
      archivo: async () => {
        const doc = generarPdfPolizaGarantia({
          titulo: garantia.titulo,
          contenido: garantia.contenido,
          clienteNombre: orden.clienteNombre || "Cliente",
          folioOT: orden.folio,
          anosGarantia: garantia.anosGarantia,
          fechaInicio: garantia.fechaInicio,
          fechaVencimiento: garantia.fechaVencimiento,
          responsable: garantia.entregadoPorNombre || orden.asesorEjecutorNombre || "Sauceda Construye",
          token: garantia.token,
        });
        return {
          buffer: Buffer.from(doc.output("arraybuffer")),
          nombreArchivo: `${limpiarNombre(`Póliza de garantía - ${orden.clienteNombre || "Cliente"} - ${orden.folio}`)}.pdf`,
        };
      },
    });
  }

  for (const r of recibos) {
    bloques.push({
      clave: `recibo:${r.id}`,
      nombre: `Recibo ${r.folio}`,
      detalle: formatoPesos(r.monto),
      vista: r.token ? { ruta: `/recibo/${r.token}`, unaHoja: true } : undefined,
      nombreArchivo: `${limpiarNombre(`Recibo ${r.folio} - ${r.clienteNombre || orden.clienteNombre || "Cliente"}`)}.pdf`,
      archivo: async () => {
        const doc = generarPdfRecibo({
          folio: r.folio,
          fechaPago: r.fechaPago || r.createdAt,
          clienteNombre: r.clienteNombre || orden.clienteNombre || "Cliente",
          monto: r.monto,
          montoLetra: r.montoLetra,
          metodoPago: r.metodoPago,
          referenciaPago: r.referenciaPago,
          concepto: r.concepto,
          saldoAnterior: r.saldoAnterior,
          saldoRestante: r.saldoRestante,
          recibidoPorNombre: r.recibidoPorNombre,
          folioOT: orden.folio,
          notas: r.notas,
        });
        return {
          buffer: Buffer.from(doc.output("arraybuffer")),
          nombreArchivo: `${limpiarNombre(`Recibo ${r.folio} - ${r.clienteNombre || orden.clienteNombre || "Cliente"}`)}.pdf`,
        };
      },
    });
  }

  // Contrato firmado (PDF escaneado cargado al sistema)
  try {
    const { data: contratos } = await sb
      .from("contratos")
      .select("id, folio, version, pdf_firmado_url")
      .eq("orden_trabajo_id", ordenId)
      .eq("estado", "firmado")
      .not("pdf_firmado_url", "is", null)
      .order("version", { ascending: false })
      .limit(1);
    const c = contratos?.[0];
    if (c?.pdf_firmado_url) {
      bloques.push({
        clave: `contrato:${c.id}`,
        nombre: `Contrato firmado ${c.folio}`,
        detalle: "PDF firmado por el cliente",
        archivo: async () => {
          const { data, error } = await sb.storage.from("contratos").download(c.pdf_firmado_url as string);
          if (error || !data) return null;
          return {
            buffer: Buffer.from(await data.arrayBuffer()),
            nombreArchivo: `${limpiarNombre(`Contrato ${c.folio} - ${orden.clienteNombre || "Cliente"}`)}.pdf`,
          };
        },
      });
    }
  } catch {
    /* sin contrato firmado */
  }

  const lineas: string[] = [
    `🛠️ <b>ORDEN DE TRABAJO ${esc(orden.folio)}</b>`,
    ``,
    `📋 <b>Trabajo:</b> ${esc(orden.titulo)}`,
    `🏷️ <b>Servicio:</b> ${esc(labelTipoNegocio(orden.tipoNegocio))}`,
    `📌 <b>Estatus:</b> ${esc(ESTATUS[orden.estatus] || orden.estatus)}`,
    ``,
    `👤 <b>Cliente:</b> ${esc(orden.clienteNombre || "—")}`,
    orden.clienteTelefono ? `📞 <b>Teléfono:</b> ${esc(orden.clienteTelefono)}` : "",
    direccion ? `🏠 <b>Dirección:</b> ${esc(direccion)}` : "",
    mapa ? `🗺️ <a href="${esc(mapa)}">Abrir ubicación en Google Maps</a>` : "",
    ``,
    `📅 <b>Fecha programada:</b> ${esc(fechaLarga(orden.fechaProgramada))}`,
    instalacion ? `🔧 <b>Instalación agendada:</b> ${esc(instalacion)}` : "",
    orden.fechaInicio ? `▶️ <b>Inicio:</b> ${esc(fechaLarga(orden.fechaInicio))}` : "",
    orden.fechaConclusion ? `✅ <b>Conclusión:</b> ${esc(fechaLarga(orden.fechaConclusion))}` : "",
    ``,
    `🧑‍🔧 <b>Asesor ejecutor:</b> ${esc(orden.asesorEjecutorNombre || "Sin asignar")}`,
    orden.asesorResponsableNombre ? `🧑‍💼 <b>Responsable:</b> ${esc(orden.asesorResponsableNombre)}` : "",
    ``,
    `💰 <b>Total cotizado:</b> ${esc(formatoPesos(orden.totalCotizado || 0))}`,
    `💵 <b>Cobrado:</b> ${esc(formatoPesos(orden.totalPagado || 0))}`,
    `🧾 <b>Saldo por cobrar:</b> ${esc(formatoPesos(orden.saldoRestante ?? Math.max((orden.totalCotizado || 0) - (orden.totalPagado || 0), 0)))}`,
  ];
  if (orden.descripcion) lineas.push(``, `📝 <b>Detalle:</b> ${esc(String(orden.descripcion).slice(0, 400))}`);
  if (bloques.length > 0) {
    lineas.push(``, `📎 <b>Documentos adjuntos (${bloques.length}):</b>`, ...bloques.map((b) => `• ${esc(b.nombre)}`));
  }
  const html = lineas.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  return { sb, orden, bloques, html };
}

/** Vista previa del envío: resumen, documentos disponibles y asesores (con su estado de Telegram). */
export async function obtenerEstadoEnvioOTTelegramAction(ordenId: string): Promise<EstadoEnvioOTTelegram> {
  const vacio = { documentos: [], destinatarios: [] };
  try {
    await requireAdmin();
    const paquete = await armarPaqueteOT(ordenId);
    if (!paquete) return { ok: false, error: "No se encontró la orden de trabajo.", ...vacio };
    const { sb, orden, bloques, html } = paquete;

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    let bot = "";
    if (botToken) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        bot = (await r.json())?.result?.username || "";
      } catch {
        /* sin nombre del bot */
      }
    }

    const { data: perfiles } = await sb
      .from("perfiles")
      .select("id, nombre, rol, telegram_chat_id")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    const destinatarios: DestinatarioOT[] = (perfiles || []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      rol: p.rol || "",
      tieneTelegram: Boolean(p.telegram_chat_id),
      preseleccionado: p.id === orden.asesorEjecutorId || p.id === orden.asesorResponsableId,
      enlaceVinculacion: !p.telegram_chat_id && bot ? `https://t.me/${bot}?start=${p.id}` : undefined,
    }));

    return {
      ok: true,
      html,
      documentos: bloques.map(({ clave, nombre, detalle }) => ({ clave, nombre, detalle })),
      destinatarios,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al preparar el envío.", ...vacio };
  }
}

export interface ResultadoEnvioOT {
  ok: boolean;
  error?: string;
  /** Documentos que no se pudieron generar idénticos a la página impresa y salieron en formato alterno. */
  enFormatoAlterno?: string[];

  enviados: { nombre: string; ok: boolean; documentos: number; error?: string }[];
}

/** Envía el resumen de la orden y los PDF elegidos a uno o varios asesores por Telegram. */
export async function enviarOTPorTelegramAction(
  ordenId: string,
  perfilIds: string[],
  clavesDocumentos: string[]
): Promise<ResultadoEnvioOT> {
  try {
    await requireAdmin();
    if (perfilIds.length === 0) return { ok: false, error: "Selecciona al menos un asesor.", enviados: [] };

    const paquete = await armarPaqueteOT(ordenId);
    if (!paquete) return { ok: false, error: "No se encontró la orden de trabajo.", enviados: [] };
    const { sb, orden, bloques, html } = paquete;

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return { ok: false, error: "El bot de Telegram no está configurado.", enviados: [] };

    const { data: perfiles } = await sb.from("perfiles").select("id, nombre, telegram_chat_id").in("id", perfilIds);

    // Se generan los PDF una sola vez y se reutilizan para cada asesor
    const elegidos = bloques.filter((b) => clavesDocumentos.includes(b.clave));
    const archivos: { nombre: string; buffer: Buffer; nombreArchivo: string }[] = [];
    const enFormatoAlterno: string[] = [];

    // 1) PDF idéntico al que se imprime (se renderiza la misma página pública). Se pide primero al
    //    propio servidor (sin pasar por el dominio público) y luego a la URL pública.
    const conVista = elegidos.filter((b) => b.vista);
    const desdeVista = new Map<string, Buffer>();
    const motivosFallo = new Map<string, string>();
    if (conVista.length > 0) {
      const bases = [`http://127.0.0.1:${process.env.PORT || 3000}`, siteUrl()];
      const pdfs = await pdfsDesdeVistas(conVista.map((b) => b.vista as VistaPdf), bases);
      conVista.forEach((b, i) => {
        const r = pdfs[i];
        if (r.pdf) desdeVista.set(b.clave, r.pdf);
        else {
          motivosFallo.set(b.clave, r.motivo || "motivo desconocido");
          console.warn(`[OT Telegram] "${b.nombre}" en formato alterno: ${r.motivo}`);
        }
      });
    }

    // 2) Respaldo (jsPDF) para lo que no se pudo renderizar
    for (const b of elegidos) {
      try {
        const pdf = desdeVista.get(b.clave);
        if (pdf && b.nombreArchivo) {
          archivos.push({ nombre: b.nombre, buffer: pdf, nombreArchivo: b.nombreArchivo });
          continue;
        }
        const a = await b.archivo();
        if (a) {
          archivos.push({ nombre: b.nombre, ...a });
          if (b.vista) enFormatoAlterno.push(`${b.nombre} — ${motivosFallo.get(b.clave) || "sin detalle"}`);
        }
      } catch (e) {
        console.warn(`[OT Telegram] No se pudo generar "${b.nombre}":`, e);
      }
    }

    const enviados: ResultadoEnvioOT["enviados"] = [];
    for (const p of perfiles || []) {
      if (!p.telegram_chat_id) {
        enviados.push({ nombre: p.nombre, ok: false, documentos: 0, error: "Sin Telegram vinculado" });
        continue;
      }
      const base = siteUrl();
      const msg = await enviarMensajeTelegram({
        botToken,
        chatId: p.telegram_chat_id,
        texto: html,
        parseMode: "HTML",
        inlineKeyboard: [
          [
            { text: "🔗 Abrir orden en el CRM", url: `${base}/ordenes-trabajo/${ordenId}` },
            { text: "🌐 Portal del cliente", url: `${base}/orden-trabajo/entrega/${orden.token}` },
          ],
        ],
      });
      if (!msg.ok) {
        enviados.push({ nombre: p.nombre, ok: false, documentos: 0, error: msg.error });
        continue;
      }
      let docsOk = 0;
      for (const a of archivos) {
        const r = await enviarDocumentoTelegram({
          botToken,
          chatId: p.telegram_chat_id,
          contenido: a.buffer,
          nombreArchivo: a.nombreArchivo,
          caption: `📎 <b>${esc(a.nombre)}</b> · ${esc(orden.folio)}`,
        });
        if (r.ok) docsOk++;
      }
      enviados.push({ nombre: p.nombre, ok: true, documentos: docsOk, error: docsOk < archivos.length ? `Solo ${docsOk} de ${archivos.length} documentos` : undefined });
    }

    const okNombres = enviados.filter((e) => e.ok).map((e) => e.nombre);
    if (okNombres.length > 0) {
      await registrarActividad(sb, {
        expedienteId: orden.expedienteId,
        prospectoId: orden.prospectoId,
        tipo: "construccion",
        titulo: `Orden ${orden.folio} enviada por Telegram a asesores`,
        detalle: `Enviada a: ${okNombres.join(", ")}. Documentos: ${archivos.map((a) => a.nombre).join(", ") || "solo resumen"}.`,
      });
    }
    revalidatePath(`/ordenes-trabajo/${ordenId}`);

    return {
      ok: okNombres.length > 0,
      error: okNombres.length > 0 ? undefined : enviados.map((e) => `${e.nombre}: ${e.error}`).join(" · "),
      enFormatoAlterno,
      enviados,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al enviar por Telegram.", enviados: [] };
  }
}
