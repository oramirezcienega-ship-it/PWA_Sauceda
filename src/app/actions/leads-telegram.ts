"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";
import { enviarDocumentoTelegram, enviarFotosBufferTelegram } from "@/lib/telegram-envios";
import { armarHtmlLeadTelegram, type DatosLeadTelegram } from "@/lib/lead-telegram-formato";
import {
  armarInformacionLead,
  generarResumenLeadIA,
  descargarMediaWhatsApp,
  registrarRespuestaLead,
  procesarRecordatoriosLeadsTelegram,
  tecladoLead,
  tituloActividadLead,
} from "@/lib/lead-telegram";
import { alternarPausaIA, asignarAgente } from "@/app/actions/conversaciones";
import { variantesTelefono } from "@/lib/telefono";

export interface EnvioLeadTelegram {
  id: string;
  asesorNombre: string;
  enviadoPorNombre: string;
  estado: "enviado" | "revisado" | "rechazado";
  enviadoAt: string;
  respondidoAt: string | null;
  respondidoVia: "telegram" | "manual" | null;
  recordatorioAt: string | null;
}

const aEnvio = (e: any): EnvioLeadTelegram => ({
  id: e.id,
  asesorNombre: e.asesor_nombre,
  enviadoPorNombre: e.enviado_por_nombre,
  estado: e.estado,
  enviadoAt: e.created_at,
  respondidoAt: e.respondido_at,
  respondidoVia: e.respondido_via,
  recordatorioAt: e.recordatorio_at,
});

async function nombreUsuarioActual(sb: ReturnType<typeof supabaseServidor>) {
  const u = await usuarioActual();
  if (!u) return { id: null as string | null, nombre: "" };
  const { data } = await sb.from("perfiles").select("nombre").eq("id", u.id).maybeSingle();
  return { id: u.id, nombre: (data?.nombre as string) || u.email || "" };
}

export interface PrevisualizacionLeadTelegram {
  ok: boolean;
  error?: string;
  datos?: DatosLeadTelegram;
  /** Resumen sugerido por la IA (editable antes de enviar). */
  resumen?: string;
  txt?: string;
  nombreArchivo?: string;
  /** Fotos del cliente que se enviarán (mediaId o URL). */
  fotos?: { ref: string; numero: number; caption: string }[];
  /** Comparativas de precios enviadas al cliente que también se enviarán. */
  comparativas?: { ref: string; numero: number; caption: string }[];
  asesores?: { id: string; nombre: string; tieneTelegram: boolean }[];
}

/** Arma la vista previa (ficha, resumen de la IA, TXT y fotos) sin enviar nada. */
export async function previsualizarLeadTelegramAction(telefono: string): Promise<PrevisualizacionLeadTelegram> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const yo = await nombreUsuarioActual(sb);
    const r = await armarInformacionLead(sb, telefono, yo.nombre);
    if (!r.ok || !r.info) return { ok: false, error: r.error };

    const [resumen, { data: perfiles }] = await Promise.all([
      generarResumenLeadIA(r.info.transcripcion, r.info.datos.clienteNombre),
      sb.from("perfiles").select("id, nombre, telegram_chat_id").eq("activo", true).order("nombre"),
    ]);

    return {
      ok: true,
      datos: r.info.datos,
      resumen,
      txt: r.info.txt,
      nombreArchivo: r.info.nombreArchivo,
      fotos: r.info.fotos,
      comparativas: r.info.comparativas,
      asesores: (perfiles || []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        tieneTelegram: Boolean(p.telegram_chat_id),
      })),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al preparar la vista previa." };
  }
}

export interface ResultadoEnvioLead {
  ok: boolean;
  error?: string;
  /** Avisos no bloqueantes (p. ej. fotos que no se pudieron enviar). */
  avisos?: string[];
  envio?: EnvioLeadTelegram;
}

/**
 * Pasa el lead al asesor: lo asigna, pausa a Sofía, le envía por Telegram la
 * ficha + resumen, la conversación (TXT) y las fotos del cliente, y lo registra
 * en la bitácora del expediente / prospecto.
 */
export async function enviarLeadTelegramAction(input: {
  telefono: string;
  asesorId: string;
  resumen: string;
  nota: string;
}): Promise<ResultadoEnvioLead> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const avisos: string[] = [];

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return { ok: false, error: "El bot de Telegram no está configurado." };

    const { data: asesor } = await sb
      .from("perfiles")
      .select("id, nombre, telegram_chat_id")
      .eq("id", input.asesorId)
      .maybeSingle();
    if (!asesor) return { ok: false, error: "No se encontró al asesor." };
    if (!asesor.telegram_chat_id)
      return { ok: false, error: `${asesor.nombre} no tiene Telegram vinculado. Vincúlalo desde su perfil.` };

    const yo = await nombreUsuarioActual(sb);
    const r = await armarInformacionLead(sb, input.telefono, yo.nombre);
    if (!r.ok || !r.info) return { ok: false, error: r.error };
    const info = r.info;

    // 1. Mensaje principal con los botones de confirmación (el id se crea antes para el callback)
    const envioId = crypto.randomUUID();
    const html = armarHtmlLeadTelegram(info.datos, input.resumen, input.nota);
    const msg = await enviarMensajeTelegram({
      botToken,
      chatId: asesor.telegram_chat_id,
      texto: html,
      parseMode: "HTML",
      inlineKeyboard: tecladoLead(envioId),
    });
    if (!msg.ok) return { ok: false, error: `Telegram rechazó el mensaje: ${msg.error}` };

    // Se registra de inmediato para que el botón "Recibido" funcione aunque aún se suban adjuntos
    const fila = {
      id: envioId,
      telefono: info.telefono,
      prospecto_id: info.datos.prospectoId,
      expediente_id: info.datos.expedienteId,
      cliente_nombre: info.datos.clienteNombre,
      asesor_id: asesor.id,
      asesor_nombre: asesor.nombre,
      enviado_por_id: yo.id,
      enviado_por_nombre: yo.nombre,
      nota: input.nota.trim(),
      resumen: input.resumen.trim(),
      telegram_message_id: msg.messageId ?? null,
      estado: "enviado",
    };
    const { error: errIns } = await sb.from("leads_envios_telegram").insert(fila);
    if (errIns) avisos.push(`Se envió por Telegram, pero no se pudo registrar el envío: ${errIns.message}`);

    // 2. Conversación completa en texto plano
    const doc = await enviarDocumentoTelegram({
      botToken,
      chatId: asesor.telegram_chat_id,
      contenido: Buffer.from(info.txt, "utf-8"),
      nombreArchivo: info.nombreArchivo,
      mimeType: "text/plain",
      caption: `💬 Conversación con ${info.datos.clienteNombre}`,
    });
    if (!doc.ok) avisos.push(`No se pudo adjuntar la conversación: ${doc.error}`);

    // 3. Imágenes: comparativa de precios enviada al cliente y fotos del cliente
    const enviarImagenes = async (
      lista: { ref: string; numero: number; caption: string }[],
      nombre: (n: number) => string,
      caption: (f: { numero: number; caption: string }) => string
    ): Promise<number> => {
      if (lista.length === 0) return 0;
      const descargadas = await Promise.all(lista.map((f) => descargarMediaWhatsApp(f.ref)));
      const fotos = lista
        .map((f, i) => ({ f, d: descargadas[i] }))
        .filter((x) => x.d)
        .map(({ f, d }) => ({ contenido: d!.contenido, mimeType: d!.mimeType, nombre: nombre(f.numero), caption: caption(f) }));
      if (fotos.length === 0) return 0;
      const res = await enviarFotosBufferTelegram({ botToken, chatId: String(asesor.telegram_chat_id), fotos });
      return res.enviadas;
    };

    const compEnviadas = await enviarImagenes(
      info.comparativas,
      (n) => `comparativa_${n}.jpg`,
      (f) => `💲 Comparativa enviada al cliente${f.caption ? ` · ${f.caption}` : ""}`
    );
    if (compEnviadas < info.comparativas.length)
      avisos.push(`Se enviaron ${compEnviadas} de ${info.comparativas.length} comparativas de precios (alguna ya no está disponible en WhatsApp).`);

    const fotosEnviadas = await enviarImagenes(
      info.fotos,
      (n) => `foto_${n}.jpg`,
      (f) => `Foto ${f.numero} del cliente${f.caption ? ` · ${f.caption}` : ""}`
    );
    if (fotosEnviadas < info.fotos.length)
      avisos.push(`Se enviaron ${fotosEnviadas} de ${info.fotos.length} fotos del cliente (algunas ya no están disponibles en WhatsApp).`);

    // 4. Asignación y pausa de Sofía
    const pausa = await alternarPausaIA(input.telefono, true);
    if (!pausa.ok) avisos.push(`No se pudo pausar a Sofía: ${pausa.error}`);
    const asig = await asignarAgente(input.telefono, asesor.nombre);
    if (!asig.ok) avisos.push(`No se pudo asignar la conversación: ${asig.error}`);

    // 5. Bitácora (el título refleja el estado actual por si el asesor ya confirmó)
    const { data: actual } = await sb.from("leads_envios_telegram").select("*").eq("id", envioId).maybeSingle();
    let actividadId: string | null = null;
    if (fila.expediente_id || fila.prospecto_id) {
      const detalle = [
        `Enviado por ${yo.nombre || "—"}. Se asignó a ${asesor.nombre} y se pausó a Sofía.`,
        `Incluye: ficha del cliente, conversación (${info.datos.totalMensajes} mensajes, TXT)${
          compEnviadas ? `, ${compEnviadas} comparativa(s) de precios` : ""
        }${fotosEnviadas ? ` y ${fotosEnviadas} foto(s) del cliente` : ""}.`,
        fila.nota ? `Nota: ${fila.nota}` : "",
        fila.resumen ? `Resumen:\n${fila.resumen}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const { data: act } = await sb
        .from("actividades")
        .insert({
          expediente_id: fila.expediente_id,
          prospecto_id: fila.prospecto_id,
          tipo: "telegram_lead",
          titulo: tituloActividadLead(actual || fila),
          detalle,
        })
        .select("id")
        .maybeSingle();
      actividadId = act?.id ?? null;
    }

    const { data: guardado } = await sb
      .from("leads_envios_telegram")
      .update({ actividad_id: actividadId, fotos_enviadas: fotosEnviadas })
      .eq("id", envioId)
      .select("*")
      .maybeSingle();

    if (fila.expediente_id) revalidatePath(`/expedientes/${fila.expediente_id}`);
    if (fila.prospecto_id) revalidatePath(`/prospectos/${fila.prospecto_id}`);

    return { ok: true, avisos, envio: guardado ? aEnvio(guardado) : undefined };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al enviar el lead por Telegram." };
  }
}

/** Último envío del lead de esta conversación (y dispara recordatorios vencidos). */
export async function obtenerEnvioLeadTelegramAction(telefono: string): Promise<EnvioLeadTelegram | null> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    await procesarRecordatoriosLeadsTelegram(sb).catch(() => undefined);
    const ids = telefono.startsWith("messenger:") || telefono.startsWith("instagram:") ? [telefono] : variantesTelefono(telefono);
    const { data } = await sb
      .from("leads_envios_telegram")
      .select("*")
      .in("telefono", ids)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? aEnvio(data) : null;
  } catch {
    return null;
  }
}

/** Marca a mano que el asesor ya revisó el lead (p. ej. lo confirmó por llamada). */
export async function marcarLeadRevisadoManualAction(envioId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const r = await registrarRespuestaLead(supabaseServidor(), envioId, "revisado", "manual");
    return { ok: r.ok, error: r.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al marcar como revisado." };
  }
}
