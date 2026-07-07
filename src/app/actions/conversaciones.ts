"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { enviarMessengerTexto } from "@/lib/messenger";
import { variantesTelefono } from "@/lib/telefono";
import { diagnosticoIA } from "@/lib/ia/agente";
import type {
  ConversacionDetalle,
  ConversacionResumen,
  MensajeChat,
} from "@/lib/types";

/** Devuelve true si el identificador es un canal de red social (no es teléfono). */
function esCanalSocial(telefono: string): boolean {
  return telefono.startsWith("messenger:") || telefono.startsWith("instagram:");
}

/** Variantes de búsqueda para el identificador (social: solo exacto; tel: múltiples formatos). */
function variantesId(telefono: string): string[] {
  if (esCanalSocial(telefono)) return [telefono];
  return variantesTelefono(telefono);
}

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
  const nombresAsesor = new Map<string, string>();
  if (expIds.length > 0) {
    const { data: exps } = await sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, segundo_apellido, perfiles:asesor_id(nombre)")
      .in("id", expIds);
    (exps ?? []).forEach((e: any) => {
      nombres.set(e.id as string, nombreDe(e));
      if (e.perfiles?.nombre) {
        nombresAsesor.set(e.id as string, e.perfiles.nombre);
      }
    });
  }

  // Resuelve nombres desde los prospectos enlazados (una sola consulta).
  const prosIds = Array.from(
    new Set(filas.map((f) => f.prospecto_id).filter(Boolean) as string[]),
  );
  const nombresPros = new Map<string, string>();
  const nombresAsesorPros = new Map<string, string>();
  if (prosIds.length > 0) {
    const { data: pros } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido, perfiles:asesor_id(nombre)")
      .in("id", prosIds);
    (pros ?? []).forEach((p: any) => {
      const nom = [p.nombre, p.primer_apellido, p.segundo_apellido]
        .filter(Boolean)
        .join(" ");
      nombresPros.set(p.id as string, nom);
      if (p.perfiles?.nombre) {
        nombresAsesorPros.set(p.id as string, p.perfiles.nombre);
      }
    });
  }

  const resumenes: ConversacionResumen[] = [];
  porTel.forEach((arr, telefono) => {
    const ultimo = arr[0];
    // Quién atiende = el último mensaje que tenga agente (de cualquier dirección)
    const ultimoConAgente = arr.find((f) => f.agente);
    const ultimoInbound = arr.find((f) => f.direccion === "in");

    const asesorNombre =
      (ultimo.expediente_id && nombresAsesor.get(ultimo.expediente_id)) ||
      (ultimo.prospecto_id && nombresAsesorPros.get(ultimo.prospecto_id));

    const atiendeFinal = asesorNombre || ultimoConAgente?.agente || "";

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
      atiende: atiendeFinal,
      ultimaDireccion: ultimo.direccion,
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
    .in("telefono", variantesId(telefono))
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const filas = (data as FilaMsg[]) ?? [];
  if (filas.length === 0) {
    // Si no hay mensajes de WhatsApp en el historial, intentamos resolver el nombre
    // buscando el número en expedientes o prospectos usando normalización de los últimos 10 dígitos.
    const digitos = telefono.replace(/\D/g, "").slice(-10);
    if (!digitos) return null;

    const { data: exps } = await sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, segundo_apellido, prospecto_id, telefono, perfiles:asesor_id(nombre)");
    
    const exp = (exps ?? []).find(
      (e: any) => (e.telefono || "").replace(/\D/g, "").slice(-10) === digitos
    );

    let expId: string | null = null;
    let prosId: string | null = null;
    let nombreExpediente = "";
    let nombreProspecto = "";
    let asesorNombreMock = "";

    if (exp) {
      expId = exp.id;
      prosId = exp.prospecto_id;
      nombreExpediente = nombreDe(exp as any);
      if ((exp as any).perfiles?.nombre) {
        asesorNombreMock = (exp as any).perfiles.nombre;
      }
    }

    if (!prosId) {
      const { data: prosList } = await sb
        .from("prospectos")
        .select("id, nombre, primer_apellido, segundo_apellido, telefono, perfiles:asesor_id(nombre)");
      const pros = (prosList ?? []).find(
        (p: any) => (p.telefono || "").replace(/\D/g, "").slice(-10) === digitos
      );
      if (pros) {
        prosId = pros.id;
        nombreProspecto = [pros.nombre, pros.primer_apellido, pros.segundo_apellido]
          .filter(Boolean)
          .join(" ");
        if (!asesorNombreMock && (pros as any).perfiles?.nombre) {
          asesorNombreMock = (pros as any).perfiles.nombre;
        }
      }
    } else {
      const { data: pros } = await sb
        .from("prospectos")
        .select("nombre, primer_apellido, segundo_apellido, perfiles:asesor_id(nombre)")
        .eq("id", prosId)
        .maybeSingle();
      if (pros) {
        nombreProspecto = [pros.nombre, pros.primer_apellido, pros.segundo_apellido]
          .filter(Boolean)
          .join(" ");
        if (!asesorNombreMock && (pros as any).perfiles?.nombre) {
          asesorNombreMock = (pros as any).perfiles.nombre;
        }
      }
    }

    const nombreFinal = nombreExpediente || nombreProspecto || telefono;

    return {
      telefono,
      expedienteId: expId,
      prospectoId: prosId,
      nombre: nombreFinal,
      ventanaAbierta: false,
      mensajes: [],
      ultimoInboundFecha: null,
      finalizado: false,
      nombreProspecto: nombreProspecto || undefined,
      nombreExpediente: nombreExpediente || undefined,
      atiende: asesorNombreMock || "",
    };
  }

  const recientes = filas.slice().reverse();
  const expedienteId =
    recientes.find((f) => f.expediente_id)?.expediente_id ?? null;
  const prospectoId =
    recientes.find((f) => f.prospecto_id)?.prospecto_id ?? null;

  let nombre = telefono;
  let nombreExpediente = "";
  let nombreProspecto = "";

  let asesorNombre = "";

  if (expedienteId) {
    const { data: e } = await sb
      .from("expedientes")
      .select("cliente, primer_apellido, segundo_apellido, perfiles:asesor_id(nombre)")
      .eq("id", expedienteId)
      .maybeSingle();
    if (e) {
      nombreExpediente = nombreDe(e as any);
      if ((e as any).perfiles?.nombre) {
        asesorNombre = (e as any).perfiles.nombre;
      }
    }
  }

  if (prospectoId) {
    const { data: p } = await sb
      .from("prospectos")
      .select("nombre, primer_apellido, segundo_apellido, perfiles:asesor_id(nombre)")
      .eq("id", prospectoId)
      .maybeSingle();
    if (p) {
      nombreProspecto = [p.nombre, p.primer_apellido, p.segundo_apellido]
        .filter(Boolean)
        .join(" ");
      if (!asesorNombre && (p as any).perfiles?.nombre) {
        asesorNombre = (p as any).perfiles.nombre;
      }
    }
  }

  nombre = nombreExpediente || nombreProspecto || telefono;
  const ultimoInbound = recientes.find((f) => f.direccion === "in");
  const ultimo = recientes[0];
  const ultimoConAgente = recientes.find((f) => f.agente);
  const atiendeFinal = asesorNombre || ultimoConAgente?.agente || "";

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
    atiende: atiendeFinal,
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
    .in("telefono", variantesId(telefono))
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

  let r: { ok: boolean; error?: string; messageId?: string };
  let canal: string;
  if (telefono.startsWith("messenger:")) {
    const psid = telefono.slice("messenger:".length);
    r = await enviarMessengerTexto(psid, texto);
    canal = "Messenger";
  } else if (telefono.startsWith("instagram:")) {
    const psid = telefono.slice("instagram:".length);
    r = await enviarMessengerTexto(psid, texto);
    canal = "Instagram";
  } else {
    r = await enviarWhatsAppTexto(telefono, texto);
    canal = "WhatsApp";
  }
  await sb.from("mensajes_whatsapp").insert({
    telefono,
    texto,
    direccion: "out",
    expediente_id: expedienteId,
    prospecto_id: prospectoId,
    estado: r.ok ? "enviado" : "error",
    agente,
    wa_message_id: (r as any).messageId || null,
  });
  if (r.ok && expedienteId) {
    await registrarActividad(sb, {
      expedienteId,
      tipo: "mensaje",
      titulo: `Respuesta por ${canal}`,
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
    .in("telefono", variantesId(telefono));
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
    wa_message_id: r.messageId || null,
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

  // Actualizar el estado finalizado para todos los mensajes de todas las variantes de este teléfono
  const { error } = await sb
    .from("mensajes_whatsapp")
    .update({ finalizado })
    .in("telefono", variantesId(telefono));

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
    .in("telefono", variantesId(telefono))
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


// ─── Respuestas Rápidas ──────────────────────────────────────────────────────

export interface RespuestaRapidaDB {
  id: string;
  atajo: string;
  titulo: string;
  texto: string;
  categoria: string;
  orden: number;
  created_at: string;
}

/** Lista todas las respuestas rápidas ordenadas. */
export async function listarRespuestasRapidas(): Promise<RespuestaRapidaDB[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("respuestas_rapidas")
    .select("*")
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RespuestaRapidaDB[];
}

/** Crea o actualiza una respuesta rápida. */
export async function guardarRespuestaRapida(datos: {
  id?: string;
  atajo: string;
  titulo: string;
  texto: string;
  categoria: string;
  orden?: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { id, ...campos } = datos;

  if (id) {
    const { error } = await sb.from("respuestas_rapidas").update(campos).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb.from("respuestas_rapidas").insert(campos);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Elimina una respuesta rápida. */
export async function eliminarRespuestaRapida(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("respuestas_rapidas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cuenta cuántas conversaciones abiertas tienen el último mensaje entrante
 * (el cliente escribió y nadie ha respondido todavía).
 * Se usa para el badge del menú de Conversaciones.
 */
export async function contarConversacionesPendientes(): Promise<number> {
  try {
    const { usuarioActual } = await import("@/lib/supabase/cliente-sesion");
    const u = await usuarioActual();
    if (!u) return 0;
    const sb = supabaseServidor();
    const { data } = await sb
      .from("mensajes_whatsapp")
      .select("telefono, direccion, finalizado, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (!data) return 0;
    // Agrupar por teléfono y tomar el último mensaje de cada hilo
    const porTel = new Map<string, { direccion: string; finalizado: boolean }>();
    for (const f of data as { telefono: string; direccion: string; finalizado?: boolean; created_at: string }[]) {
      if (!porTel.has(f.telefono)) {
        porTel.set(f.telefono, { direccion: f.direccion, finalizado: f.finalizado ?? false });
      }
    }
    let count = 0;
    porTel.forEach(({ direccion, finalizado }) => {
      if (!finalizado && direccion === "in") count++;
    });
    return count;
  } catch {
    return 0;
  }
}
