"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { diagnosticoIA } from "@/lib/ia/agente";
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
  agente: string;
  created_at: string;
  finalizado?: boolean;
}

/** Nombre del asesor con sesión activa (de su perfil, o su correo). */
async function nombreAgenteActual(
  sb: ReturnType<typeof supabaseServidor>,
): Promise<string> {
  const user = await usuarioActual();
  if (!user) return "";
  const { data } = await sb
    .from("perfiles")
    .select("nombre")
    .eq("id", user.id)
    .maybeSingle();
  const nombre = (data as { nombre?: string } | null)?.nombre?.trim();
  return nombre || user.email || "";
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

  // Resuelve nombres desde los prospectos enlazados (una sola consulta).
  const prosIds = Array.from(
    new Set(filas.map((f) => f.prospecto_id).filter(Boolean) as string[]),
  );
  const nombresPros = new Map<string, string>();
  if (prosIds.length > 0) {
    const { data: pros } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido")
      .in("id", prosIds);
    (pros ?? []).forEach((p: Record<string, unknown>) => {
      const nom = [p.nombre, p.primer_apellido, p.segundo_apellido]
        .filter(Boolean)
        .join(" ");
      nombresPros.set(p.id as string, nom);
    });
  }

  const resumenes: ConversacionResumen[] = [];
  porTel.forEach((arr, telefono) => {
    const ultimo = arr[0];
    // Quién atiende = el último mensaje que tenga agente (de cualquier dirección)
    const ultimoConAgente = arr.find((f) => f.agente);
    const ultimoInbound = arr.find((f) => f.direccion === "in");

    resumenes.push({
      telefono,
      expedienteId: ultimo.expediente_id,
      prospectoId: ultimo.prospecto_id,
      nombre:
        (ultimo.expediente_id && nombres.get(ultimo.expediente_id)) ||
        (ultimo.prospecto_id && nombresPros.get(ultimo.prospecto_id)) ||
        telefono,
      ultimoTexto: ultimo.texto,
      ultimaFecha: ultimo.created_at,
      ventanaAbierta: ventanaAbierta(arr),
      ultimoInboundFecha: ultimoInbound?.created_at ?? null,
      finalizado: ultimo.finalizado ?? false,
      atiende: ultimoConAgente?.agente ?? "",
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
  let nombreExpediente = "";
  let nombreProspecto = "";

  if (expedienteId) {
    const { data: e } = await sb
      .from("expedientes")
      .select("cliente, primer_apellido, segundo_apellido")
      .eq("id", expedienteId)
      .maybeSingle();
    if (e) nombreExpediente = nombreDe(e as Record<string, string>);
  }

  if (prospectoId) {
    const { data: p } = await sb
      .from("prospectos")
      .select("nombre, primer_apellido, segundo_apellido")
      .eq("id", prospectoId)
      .maybeSingle();
    if (p) {
      nombreProspecto = [p.nombre, p.primer_apellido, p.segundo_apellido]
        .filter(Boolean)
        .join(" ");
    }
  }

  nombre = nombreExpediente || nombreProspecto || telefono;
  const ultimoInbound = recientes.find((f) => f.direccion === "in");
  const ultimo = recientes[0];

  const mensajes: MensajeChat[] = filas.map((f) => ({
    id: f.id,
    direccion: f.direccion,
    texto: f.texto,
    estado: f.estado,
    agente: f.agente ?? "",
    fecha: f.created_at,
  }));

  return {
    telefono,
    expedienteId,
    prospectoId,
    nombre,
    ventanaAbierta: ventanaAbierta(filas),
    mensajes,
    ultimoInboundFecha: ultimoInbound?.created_at ?? null,
    finalizado: ultimo?.finalizado ?? false,
    nombreExpediente: nombreExpediente || undefined,
    nombreProspecto: nombreProspecto || undefined,
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
  const agente = await nombreAgenteActual(sb);

  const r = await enviarWhatsAppTexto(telefono, texto);
  await sb.from("mensajes_whatsapp").insert({
    telefono,
    texto,
    direccion: "out",
    expediente_id: expedienteId,
    prospecto_id: prospectoId,
    estado: r.ok ? "enviado" : "error",
    agente,
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

/** Prueba el agente de IA (configuración + ping real a Claude). Solo admin. */
export async function probarIA(): Promise<{ ok: boolean; mensaje: string }> {
  await requireAdmin();
  return diagnosticoIA();
}

/**
 * Borra TODO el hilo de un número (sus mensajes de WhatsApp), para poder
 * re-probar desde cero con el mismo teléfono. No toca el expediente.
 */
export async function eliminarConversacion(
  telefono: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!telefono) return { ok: false, error: "Falta el teléfono." };
  const sb = supabaseServidor();
  const { error } = await sb
    .from("mensajes_whatsapp")
    .delete()
    .eq("telefono", telefono);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
  const agente = await nombreAgenteActual(sb);

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
    agente,
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

/** Marca o desmarca una conversación como finalizada. */
export async function finalizarConversacion(
  telefono: string,
  finalizado: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: ultimo } = await sb
    .from("mensajes_whatsapp")
    .select("id")
    .eq("telefono", telefono)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultimo) {
    return { ok: false, error: "No hay mensajes en esta conversación." };
  }

  const { error } = await sb
    .from("mensajes_whatsapp")
    .update({ finalizado })
    .eq("id", ultimo.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Asigna un asesor/agente a la conversación actualizando el último mensaje. */
export async function asignarAgente(
  telefono: string,
  agente: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: ultimo } = await sb
    .from("mensajes_whatsapp")
    .select("id")
    .eq("telefono", telefono)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultimo) {
    return { ok: false, error: "No hay mensajes en esta conversación." };
  }

  const { error } = await sb
    .from("mensajes_whatsapp")
    .update({ agente })
    .eq("id", ultimo.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Lista todos los asesores activos para reasignar conversaciones. */
export async function listarAsesoresActivos(): Promise<{ id: string; nombre: string }[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as { id: string; nombre: string }[]) ?? [];
}

