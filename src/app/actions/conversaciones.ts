"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import type {
  ConversacionDetalle,
  ConversacionResumen,
  MensajeChat,
} from "@/lib/types";

/**
 * Server actions del módulo CONVERSACIONES de WhatsApp (bandeja bidireccional).
 * Todas exigen sesión de admin. Los mensajes entrantes los guarda el webhook
 * de captación; aquí se leen los hilos y se envían las respuestas.
 */

const VENTANA_MS = 24 * 60 * 60 * 1000;

interface FilaMsg {
  id: string;
  expediente_id: string | null;
  prospecto_id: string | null;
  telefono: string;
  direccion: "in" | "out";
  texto: string;
  estado: string;
  created_at: string;
}

/** La ventana de 24 h está abierta si hubo un entrante en ese lapso. */
function ventanaAbierta(filas: FilaMsg[]): boolean {
  const ahora = Date.now();
  return filas.some(
    (f) =>
      f.direccion === "in" &&
      ahora - new Date(f.created_at).getTime() < VENTANA_MS,
  );
}

function nombreDe(e: {
  cliente?: string | null;
  primer_apellido?: string | null;
  segundo_apellido?: string | null;
}): string {
  return [e.cliente, e.primer_apellido, e.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

/** Lista las conversaciones (una por teléfono, con su último mensaje). */
export async function listarConversaciones(): Promise<ConversacionResumen[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes_whatsapp")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const filas = (data as FilaMsg[]) ?? [];

  // Agrupa por teléfono (vienen en orden descendente: el primero es el más nuevo).
  const porTel = new Map<string, FilaMsg[]>();
  filas.forEach((f) => {
    const arr = porTel.get(f.telefono) ?? [];
    arr.push(f);
    porTel.set(f.telefono, arr);
  });

  // Resuelve nombres desde los expedientes enlazados (una sola consulta).
  const expIds = Array.from(
    new Set(filas.map((f) => f.expediente_id).filter(Boolean) as string[]),
  );
  const nombres = new Map<string, string>();
  if (expIds.length > 0) {
    const { data: exps } = await sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, segundo_apellido")
      .in("id", expIds);
    (exps ?? []).forEach((e: Record<string, unknown>) =>
      nombres.set(e.id as string, nombreDe(e)),
    );
  }

  const resumenes: ConversacionResumen[] = [];
  porTel.forEach((arr, telefono) => {
    const ultimo = arr[0];
    resumenes.push({
      telefono,
      expedienteId: ultimo.expediente_id,
      prospectoId: ultimo.prospecto_id,
      nombre:
        (ultimo.expediente_id && nombres.get(ultimo.expediente_id)) || telefono,
      ultimoTexto: ultimo.texto,
      ultimaFecha: ultimo.created_at,
      ventanaAbierta: ventanaAbierta(arr),
    });
  });
  resumenes.sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
  return resumenes;
}

/** Devuelve el hilo completo de una conversación. */
export async function obtenerConversacion(
  telefono: string,
): Promise<ConversacionDetalle | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes_whatsapp")
    .select("*")
    .eq("telefono", telefono)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const filas = (data as FilaMsg[]) ?? [];
  if (filas.length === 0) return null;

  const recientes = filas.slice().reverse();
  const expedienteId =
    recientes.find((f) => f.expediente_id)?.expediente_id ?? null;
  const prospectoId =
    recientes.find((f) => f.prospecto_id)?.prospecto_id ?? null;

  let nombre = telefono;
  if (expedienteId) {
    const { data: e } = await sb
      .from("expedientes")
      .select("cliente, primer_apellido, segundo_apellido")
      .eq("id", expedienteId)
      .maybeSingle();
    if (e) nombre = nombreDe(e as Record<string, string>) || telefono;
  }

  const mensajes: MensajeChat[] = filas.map((f) => ({
    id: f.id,
    direccion: f.direccion,
    texto: f.texto,
    estado: f.estado,
    fecha: f.created_at,
  }));

  return {
    telefono,
    expedienteId,
    prospectoId,
    nombre,
    ventanaAbierta: ventanaAbierta(filas),
    mensajes,
  };
}

/** IDs de expediente/prospecto asociados al teléfono (último mensaje). */
async function idsDeTelefono(
  sb: ReturnType<typeof supabaseServidor>,
  telefono: string,
): Promise<{ expedienteId: string | null; prospectoId: string | null }> {
  const { data } = await sb
    .from("mensajes_whatsapp")
    .select("expediente_id, prospecto_id")
    .eq("telefono", telefono)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const d = data as { expediente_id: string | null; prospecto_id: string | null } | null;
  return {
    expedienteId: d?.expediente_id ?? null,
    prospectoId: d?.prospecto_id ?? null,
  };
}

/** Responde con TEXTO LIBRE (solo válido dentro de la ventana de 24 h). */
export async function responderConversacion(
  telefono: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!texto.trim()) return { ok: false, error: "El mensaje está vacío." };
  const sb = supabaseServidor();
  const { expedienteId, prospectoId } = await idsDeTelefono(sb, telefono);

  const r = await enviarWhatsAppTexto(telefono, texto);
  await sb.from("mensajes_whatsapp").insert({
    telefono,
    texto,
    direccion: "out",
    expediente_id: expedienteId,
    prospecto_id: prospectoId,
    estado: r.ok ? "enviado" : "error",
  });
  if (r.ok && expedienteId) {
    await registrarActividad(sb, {
      expedienteId,
      tipo: "mensaje",
      titulo: "Respuesta por WhatsApp",
      detalle: texto,
    });
  }
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Responde con una PLANTILLA aprobada (contacto fuera de la ventana de 24 h). */
export async function responderConPlantilla(
  telefono: string,
  plantilla: string,
  idioma: string,
  parametros: string[],
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!plantilla) return { ok: false, error: "Falta la plantilla." };
  const sb = supabaseServidor();
  const { expedienteId, prospectoId } = await idsDeTelefono(sb, telefono);

  const r = await enviarWhatsAppPlantilla(
    telefono,
    plantilla,
    idioma || "es_MX",
    parametros ?? [],
  );
  const resumen =
    `[plantilla: ${plantilla}]` +
    (parametros && parametros.length ? ` ${parametros.join(" | ")}` : "");
  await sb.from("mensajes_whatsapp").insert({
    telefono,
    texto: resumen,
    direccion: "out",
    expediente_id: expedienteId,
    prospecto_id: prospectoId,
    estado: r.ok ? "enviado" : "error",
  });
  if (r.ok && expedienteId) {
    await registrarActividad(sb, {
      expedienteId,
      tipo: "mensaje",
      titulo: "Plantilla enviada por WhatsApp",
      detalle: resumen,
    });
  }
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
