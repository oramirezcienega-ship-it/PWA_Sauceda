"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla, subirMediaMeta, enviarWhatsAppSticker, enviarWhatsAppDocumento } from "@/lib/whatsapp";
import { enviarMessengerTexto } from "@/lib/messenger";
import { enviarInstagramTexto } from "@/lib/instagram";
import { variantesTelefono, normalizarTelefono } from "@/lib/telefono";
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
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  let query = sb.from("mensajes_whatsapp").select("*");

  if (rol === "asesor" || rol === "operaciones") {
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";

    // Incluir expedientes asignados al usuario O sin asignar (null)
    const { data: exps } = await sb
      .from("expedientes")
      .select("id")
      .or(`${colId}.eq.${usuario.id},${colId}.is.null`);
    const expIds = (exps ?? []).map((e) => e.id);

    // Incluir prospectos asignados al usuario O sin asignar (null)
    const { data: pros } = await sb
      .from("prospectos")
      .select("id")
      .or(`${colId}.eq.${usuario.id},${colId}.is.null`);
    const prosIds = (pros ?? []).map((p) => p.id);

    const orFilters: string[] = ["expediente_id.is.null", "prospecto_id.is.null"];
    if (expIds.length > 0) {
      orFilters.push(`expediente_id.in.(${expIds.join(",")})`);
    }
    if (prosIds.length > 0) {
      orFilters.push(`prospecto_id.in.(${prosIds.join(",")})`);
    }

    query = query.or(orFilters.join(","));
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const filas = (data as FilaMsg[]) ?? [];

  // Agrupa por los últimos 10 dígitos del teléfono (o canal social) para asociar in/out unívocamente.
  const porTel = new Map<string, FilaMsg[]>();
  filas.forEach((f) => {
    const key = esCanalSocial(f.telefono)
      ? f.telefono
      : (f.telefono || "").replace(/\D/g, "").slice(-10);
    if (!key) return;
    const arr = porTel.get(key) ?? [];
    arr.push(f);
    porTel.set(key, arr);
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
    const conExp = arr.find((f) => f.expediente_id);
    const conPros = arr.find((f) => f.prospecto_id);
    const expId = conExp?.expediente_id ?? null;
    const prosId = conPros?.prospecto_id ?? null;

    // Ordenar mensajes por fecha para obtener el último y el último inbound
    const ordenados = [...arr].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    const ultimo = ordenados[0];
    const ultimoInbound = ordenados.find((f) => f.direccion === "in") ?? null;
    const ultimoConAgente = ordenados.find((f) => f.agente) ?? null;

    const asesorNombre =
      (expId && nombresAsesor.get(expId)) ||
      (prosId && nombresAsesorPros.get(prosId));

    const atiendeFinal = asesorNombre || ultimoConAgente?.agente || "";

    resumenes.push({
      telefono,
      expedienteId: expId,
      prospectoId: prosId,
      nombre:
        (expId && nombres.get(expId)) ||
        (prosId && nombresPros.get(prosId)) ||
        telefono,
      ultimoTexto: ultimo.texto,
      ultimaFecha: ultimo.created_at,
      ventanaAbierta: ventanaAbierta(arr),
      ultimoInboundFecha: ultimoInbound?.created_at ?? null,
      finalizado: (ultimo.finalizado ?? false) || !ventanaAbierta(arr),
      atiende: atiendeFinal,
      ultimaDireccion: ultimo.direccion,
    });
  });
  resumenes.sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
  return resumenes;
}

/** Verifica si el usuario actual tiene acceso a la conversación según su rol (asesor/operaciones). */
async function verificarAccesoConversacion(
  sb: ReturnType<typeof supabaseServidor>,
  usuario: { id: string },
  rol: "admin" | "asesor" | "operaciones",
  telefono: string,
  expedienteId: string | null,
  prospectoId: string | null,
): Promise<boolean> {
  if (rol === "admin") return true;

  const colId = rol === "asesor" ? ("asesor_id" as const) : ("operador_id" as const);

  if (expedienteId) {
    const { data } = await sb
      .from("expedientes")
      .select("asesor_id, operador_id")
      .eq("id", expedienteId)
      .maybeSingle();
    const row = data as { asesor_id: string | null; operador_id: string | null } | null;
    if (row && row[colId] === usuario.id) {
      return true;
    }
  }

  if (prospectoId) {
    const { data } = await sb
      .from("prospectos")
      .select("asesor_id, operador_id")
      .eq("id", prospectoId)
      .maybeSingle();
    const row = data as { asesor_id: string | null; operador_id: string | null } | null;
    if (row && row[colId] === usuario.id) {
      return true;
    }
  }

  // Fallback normalización últimos 10 dígitos
  const digitos = telefono.replace(/\D/g, "").slice(-10);
  if (digitos) {
    const { data: exps } = await sb
      .from("expedientes")
      .select("id, telefono, asesor_id, operador_id");
    const exp = (exps as { id: string; telefono: string | null; asesor_id: string | null; operador_id: string | null }[] ?? []).find(
      (e) => (e.telefono || "").replace(/\D/g, "").slice(-10) === digitos
    );
    if (exp && exp[colId] === usuario.id) {
      return true;
    } else if (!exp) {
      const { data: prosList } = await sb
        .from("prospectos")
        .select("id, telefono, asesor_id, operador_id");
      const pros = (prosList as { id: string; telefono: string | null; asesor_id: string | null; operador_id: string | null }[] ?? []).find(
        (p) => (p.telefono || "").replace(/\D/g, "").slice(-10) === digitos
      );
      if (pros && pros[colId] === usuario.id) {
        return true;
      }
    }
  }

  return false;
}

/** Devuelve el hilo completo de una conversación. */
export async function obtenerConversacion(
  telefono: string,
): Promise<ConversacionDetalle | null> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  if (rol === "asesor" || rol === "operaciones") {
    const { expedienteId, prospectoId } = await idsDeTelefono(sb, telefono);
    const autorizado = await verificarAccesoConversacion(sb, usuario, rol, telefono, expedienteId, prospectoId);
    if (!autorizado) {
      throw new Error("No tienes autorización para ver esta conversación.");
    }
  }

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
    finalizado: (ultimo?.finalizado ?? false) || !ventanaAbierta(filas),
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
  // 1. Intentar obtener el último mensaje que tenga algún ID asociado para este teléfono
  const { data } = await sb
    .from("mensajes_whatsapp")
    .select("expediente_id, prospecto_id")
    .in("telefono", variantesId(telefono))
    .or("expediente_id.not.is.null,prospecto_id.not.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let expId = (data as any)?.expediente_id ?? null;
  let prosId = (data as any)?.prospecto_id ?? null;

  // 2. Fallback: Buscar directamente en las tablas principales de la base de datos
  if (!expId || !prosId) {
    const v = variantesId(telefono);
    if (!prosId) {
      const { data: pros } = await sb
        .from("prospectos")
        .select("id")
        .in("telefono", v)
        .order("created_at", { ascending: false })
        .limit(1);
      if (pros && pros.length > 0) {
        prosId = pros[0].id;
      }
    }
    if (!expId) {
      if (prosId) {
        const { data: exps } = await sb
          .from("expedientes")
          .select("id")
          .eq("prospecto_id", prosId)
          .limit(1);
        if (exps && exps.length > 0) {
          expId = exps[0].id;
        }
      }
      if (!expId) {
        const { data: exps } = await sb
          .from("expedientes")
          .select("id")
          .in("telefono", v)
          .limit(1);
        if (exps && exps.length > 0) {
          expId = exps[0].id;
        }
      }
    }
  }

  return {
    expedienteId: expId,
    prospectoId: prosId,
  };
}

/** Responde con TEXTO LIBRE (solo válido dentro de la ventana de 24 h). */
export async function responderConversacion(
  telefono: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!texto.trim()) return { ok: false, error: "El mensaje está vacío." };
  const usuario = await usuarioActual();
  if (!usuario) return { ok: false, error: "No autorizado." };
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  if (rol === "asesor" || rol === "operaciones") {
    const { expedienteId, prospectoId } = await idsDeTelefono(sb, telefono);
    const autorizado = await verificarAccesoConversacion(sb, usuario, rol, telefono, expedienteId, prospectoId);
    if (!autorizado) {
      return { ok: false, error: "No tienes autorización para responder en esta conversación." };
    }
  }

  const { expedienteId, prospectoId } = await idsDeTelefono(sb, telefono);
  const agente = await nombreAgenteActual(sb);

  let r: { ok: boolean; error?: string; messageId?: string } = { ok: false };
  let canalLabel = "WhatsApp";

  if (telefono.startsWith("messenger:")) {
    const psid = telefono.slice(10);
    const res = await enviarMessengerTexto(psid, texto);
    r = { ok: res.ok, error: res.error };
    canalLabel = "Messenger";
  } else if (telefono.startsWith("instagram:")) {
    const igsid = telefono.slice(10);
    const res = await enviarInstagramTexto(igsid, texto);
    r = { ok: res.ok, error: res.error };
    canalLabel = "Instagram";
  } else {
    r = await enviarWhatsAppTexto(telefono, texto);
  }

  await sb.from("mensajes_whatsapp").insert({
    telefono: esCanalSocial(telefono) ? telefono : normalizarTelefono(telefono),
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
      titulo: `Respuesta por ${canalLabel}`,
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
    telefono: esCanalSocial(telefono) ? telefono : normalizarTelefono(telefono),
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

/** Elimina un mensaje individual de la conversación por su ID. */
export async function eliminarMensajeIndividual(
  mensajeId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!mensajeId) return { ok: false, error: "Falta el ID del mensaje." };
  const usuario = await usuarioActual();
  if (!usuario) return { ok: false, error: "No autorizado." };
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  if (rol === "asesor" || rol === "operaciones") {
    const { data: msg } = await sb
      .from("mensajes_whatsapp")
      .select("expediente_id, prospecto_id, telefono")
      .eq("id", mensajeId)
      .maybeSingle();

    if (!msg) return { ok: false, error: "Mensaje no encontrado." };

    const autorizado = await verificarAccesoConversacion(sb, usuario, rol, msg.telefono, msg.expediente_id, msg.prospecto_id);
    if (!autorizado) {
      return { ok: false, error: "No tienes autorización para modificar este mensaje." };
    }
  }

  const { error } = await sb
    .from("mensajes_whatsapp")
    .delete()
    .eq("id", mensajeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Edita el texto de un mensaje individual por su ID. */
export async function editarMensajeIndividual(
  mensajeId: string,
  nuevoTexto: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!mensajeId) return { ok: false, error: "Falta el ID del mensaje." };
  if (!nuevoTexto.trim()) return { ok: false, error: "El texto no puede estar vacío." };
  const usuario = await usuarioActual();
  if (!usuario) return { ok: false, error: "No autorizado." };
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  if (rol === "asesor" || rol === "operaciones") {
    const { data: msg } = await sb
      .from("mensajes_whatsapp")
      .select("expediente_id, prospecto_id, telefono")
      .eq("id", mensajeId)
      .maybeSingle();

    if (!msg) return { ok: false, error: "Mensaje no encontrado." };

    const autorizado = await verificarAccesoConversacion(sb, usuario, rol, msg.telefono, msg.expediente_id, msg.prospecto_id);
    if (!autorizado) {
      return { ok: false, error: "No tienes autorización para modificar este mensaje." };
    }
  }

  const { error } = await sb
    .from("mensajes_whatsapp")
    .update({ texto: nuevoTexto.trim() })
    .eq("id", mensajeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
    // Agrupar por clave de 10 dígitos (o canal social) para asociar respuestas 'out' con mensajes 'in'
    const porTel = new Map<string, { direccion: string; finalizado: boolean; creado: string; filas: any[] }>();
    for (const f of data as { telefono: string; direccion: string; finalizado?: boolean; created_at: string }[]) {
      const key = esCanalSocial(f.telefono)
        ? f.telefono
        : (f.telefono || "").replace(/\D/g, "").slice(-10);
      if (!key) continue;

      if (!porTel.has(key)) {
        porTel.set(key, {
          direccion: f.direccion,
          finalizado: f.finalizado ?? false,
          creado: f.created_at,
          filas: [],
        });
      }
      porTel.get(key)!.filas.push(f);
    }
    let count = 0;
    const ahora = Date.now();
    porTel.forEach(({ direccion, finalizado, filas }) => {
      const ventana = filas.some(
        (f) =>
          f.direccion === "in" &&
          ahora - new Date(f.created_at).getTime() < 24 * 60 * 60 * 1000
      );
      const finalizadoReal = finalizado || !ventana;
      if (!finalizadoReal && direccion === "in") count++;
    });
    return count;
  } catch {
    return 0;
  }
}

/** Envía un sticker de la biblioteca o personalizado a una conversación. */
export async function enviarStickerConversacion(
  telefono: string,
  fileBase64: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!telefono) return { ok: false, error: "Falta el teléfono." };
  if (!fileBase64) return { ok: false, error: "Falta el sticker." };

  try {
    // 1. Decodificar Base64
    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // 2. Subir a Meta
    const resUpload = await subirMediaMeta(buffer, mimeType, fileName, "sticker");
    if (!resUpload.mediaId) {
      return { ok: false, error: resUpload.error || "No se pudo subir el sticker a los servidores de WhatsApp." };
    }
    const mediaId = resUpload.mediaId;

    // 3. Enviar sticker
    const r = await enviarWhatsAppSticker(telefono, mediaId);
    if (!r.ok) {
      return { ok: false, error: r.error ?? "No se pudo enviar el sticker." };
    }

    // 4. Registrar en la base de datos
    const sb = supabaseServidor();
    const { expedienteId, prospectoId } = await idsDeTelefono(sb, telefono);
    const agente = await nombreAgenteActual(sb);

    await sb.from("mensajes_whatsapp").insert({
      telefono: esCanalSocial(telefono) ? telefono : normalizarTelefono(telefono),
      texto: `[sticker:${mediaId}]`,
      direccion: "out",
      estado: "enviado",
      agente,
      wa_message_id: r.messageId ?? null,
      expediente_id: expedienteId,
      prospecto_id: prospectoId,
    });

    if (expedienteId) {
      await registrarActividad(sb, {
        expedienteId,
        tipo: "mensaje",
        titulo: "Sticker enviado por WhatsApp",
        detalle: "Se envió un sticker al cliente.",
      });
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Error al enviar sticker de conversación:", err);
    return { ok: false, error: err.message || "Error al procesar y enviar el sticker." };
  }
}

/** Envía cualquier archivo desde la computadora directamente por WhatsApp. */
export async function enviarArchivoDirectoConversacion(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const telefono = (formData.get("telefono") as string | null)?.trim() || "";
  const archivo = formData.get("archivo") as File | null;
  const caption = (formData.get("caption") as string | null)?.trim() || "";

  if (!telefono) return { ok: false, error: "Falta el teléfono." };
  if (!archivo || archivo.size === 0) return { ok: false, error: "No se seleccionó ningún archivo." };

  const MAX_MB = 16;
  if (archivo.size > MAX_MB * 1024 * 1024) {
    return { ok: false, error: `El archivo supera el límite de ${MAX_MB} MB.` };
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const mimeType = archivo.type || "application/octet-stream";
    const filename = archivo.name;

    // Determinar categoría para Meta API
    let metaType: "image" | "sticker" | "document" | "audio" | "video" = "document";
    if (mimeType.startsWith("image/")) metaType = "image";
    else if (mimeType.startsWith("video/")) metaType = "video";
    else if (mimeType.startsWith("audio/")) metaType = "audio";

    // 1. Subir binario a Meta
    const resUpload = await subirMediaMeta(buffer, mimeType, filename, metaType);
    if (!resUpload.mediaId) {
      return { ok: false, error: resUpload.error || "No se pudo cargar el archivo en los servidores de WhatsApp." };
    }
    const mediaId = resUpload.mediaId;

    // 2. Enviar por WhatsApp
    const r = await enviarWhatsAppDocumento(telefono, mediaId, filename, caption, mimeType);
    if (!r.ok) {
      return { ok: false, error: r.error ?? "No se pudo enviar el archivo por WhatsApp." };
    }

    // 3. Registrar mensaje en la BD
    const sb = supabaseServidor();
    const { expedienteId, prospectoId } = await idsDeTelefono(sb, telefono);
    const agente = await nombreAgenteActual(sb);

    let textoFinal = "";
    if (metaType === "image") {
      textoFinal = `[image:${mediaId}]${caption ? ` ${caption}` : ""}`;
    } else if (metaType === "video") {
      textoFinal = `[video:${mediaId}]${caption ? ` ${caption}` : ""}`;
    } else {
      textoFinal = `[document:${mediaId}] ${filename}${caption ? ` — "${caption}"` : ""}`;
    }

    await sb.from("mensajes_whatsapp").insert({
      telefono: esCanalSocial(telefono) ? telefono : normalizarTelefono(telefono),
      texto: textoFinal,
      direccion: "out",
      estado: "enviado",
      agente,
      wa_message_id: r.messageId ?? null,
      expediente_id: expedienteId,
      prospecto_id: prospectoId,
    });

    if (expedienteId) {
      await registrarActividad(sb, {
        expedienteId,
        tipo: "mensaje",
        titulo: "Archivo adjunto enviado por WhatsApp",
        detalle: `Se envió el archivo "${filename}" por WhatsApp.`,
      });
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Error al enviar archivo directo de conversación:", err);
    return { ok: false, error: err.message || "Error al procesar el archivo." };
  }
}
