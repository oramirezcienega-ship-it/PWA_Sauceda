"use server";

/**
 * Pestaña "Asesores" de Conversaciones:
 * Muestra el hilo de comunicación interna con los asesores (Gerardo, Paulina, etc.)
 * a través de WhatsApp mediante Evolution API (Línea Rescate / Móvil).
 * Permite ver las fichas de leads que el sistema les pasa en automático y sus respuestas,
 * así como enviarles mensajes directos por WhatsApp desde el CRM.
 */

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { enviarMensajeTextoEvolution } from "@/lib/evolution-api";

export interface ResumenConversacionAsesor {
  asesorId: string;
  nombre: string;
  rol: string;
  telefono: string;
  telefonoWhatsapp: string;
  ultimoTexto: string;
  ultimoAt: string | null;
  ultimaDireccion: "in" | "out" | null;
  telegramChatId: string | null;
}

export interface MensajeAsesor {
  id: string;
  direccion: "in" | "out";
  texto: string;
  estado: string;
  agente: string;
  createdAt: string;
  expedienteId: string | null;
  prospectoId: string | null;
}

/**
 * Lista de asesores con actividad o disponibles para contacto por WhatsApp.
 * Gerardo aparece destacado/en la cima, y el resto ordenados por el mensaje más reciente.
 */
export async function listarConversacionesAsesores(): Promise<ResumenConversacionAsesor[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener todos los perfiles de asesores y equipo activos
  const { data: perfiles, error: errPerfiles } = await sb
    .from("perfiles")
    .select("id, nombre, rol, telefono, telefono_whatsapp, telegram_chat_id")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (errPerfiles) throw new Error(errPerfiles.message);

  const asesores = perfiles || [];
  if (asesores.length === 0) return [];

  // 2. Extraer todas las variantes de teléfonos de los asesores
  const telefonosMap = new Map<string, string>(); // variante -> asesorId
  for (const a of asesores) {
    const rawTel = a.telefono_whatsapp || a.telefono || "";
    for (const v of variantesTelefono(rawTel)) {
      telefonosMap.set(v, a.id);
    }
  }

  const variantesTotales = Array.from(telefonosMap.keys());

  // 3. Consultar mensajes en mensajes_whatsapp de esos teléfonos
  const { data: msgs } = await sb
    .from("mensajes_whatsapp")
    .select("telefono, direccion, texto, estado, agente, created_at, expediente_id, prospecto_id")
    .in("telefono", variantesTotales)
    .order("created_at", { ascending: false })
    .limit(1000);

  // 4. Agrupar mensajes por asesorId
  const porAsesor = new Map<string, any[]>();
  for (const m of msgs || []) {
    const aId = telefonosMap.get(m.telefono);
    if (aId) {
      const arr = porAsesor.get(aId) ?? [];
      arr.push(m);
      porAsesor.set(aId, arr);
    }
  }

  // 5. Construir el resumen
  const lista: ResumenConversacionAsesor[] = asesores.map((a: any) => {
    const arr = porAsesor.get(a.id) ?? [];
    const ultimo = arr[0];
    const tel = normalizarTelefono(a.telefono_whatsapp || a.telefono || "");

    return {
      asesorId: a.id,
      nombre: a.nombre,
      rol: a.rol || "asesor",
      telefono: normalizarTelefono(a.telefono || ""),
      telefonoWhatsapp: tel,
      ultimoTexto: ultimo?.texto || "",
      ultimoAt: ultimo?.created_at || null,
      ultimaDireccion: ultimo?.direccion || null,
      telegramChatId: a.telegram_chat_id || null,
    };
  });

  // Priorizar Gerardo si existe, y luego ordenar por último mensaje descendente
  return lista.sort((a, b) => {
    const aEsGerardo = a.nombre.toLowerCase().includes("gerardo");
    const bEsGerardo = b.nombre.toLowerCase().includes("gerardo");
    if (aEsGerardo && !bEsGerardo) return -1;
    if (!aEsGerardo && bEsGerardo) return 1;

    return (b.ultimoAt || "").localeCompare(a.ultimoAt || "") || a.nombre.localeCompare(b.nombre);
  });
}

/**
 * Obtiene el historial completo de mensajes entre el CRM y el asesor.
 */
export async function obtenerConversacionAsesor(
  asesorId: string
): Promise<{ mensajes: MensajeAsesor[]; asesor: ResumenConversacionAsesor | null }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: perfil } = await sb
    .from("perfiles")
    .select("id, nombre, rol, telefono, telefono_whatsapp, telegram_chat_id")
    .eq("id", asesorId)
    .maybeSingle();

  if (!perfil) return { mensajes: [], asesor: null };

  const rawTel = perfil.telefono_whatsapp || perfil.telefono || "";
  const variantes = variantesTelefono(rawTel);

  const { data: msgs } = await sb
    .from("mensajes_whatsapp")
    .select("id, direccion, texto, estado, agente, created_at, expediente_id, prospecto_id")
    .in("telefono", variantes)
    .order("created_at", { ascending: true })
    .limit(500);

  const mensajes: MensajeAsesor[] = (msgs || []).map((m: any) => ({
    id: m.id,
    direccion: m.direccion === "in" ? "in" : "out",
    texto: m.texto || "",
    estado: m.estado || "",
    agente: m.agente || "",
    createdAt: m.created_at,
    expedienteId: m.expediente_id || null,
    prospectoId: m.prospecto_id || null,
  }));

  const ultimo = mensajes[mensajes.length - 1];
  const asesorResumen: ResumenConversacionAsesor = {
    asesorId: perfil.id,
    nombre: perfil.nombre,
    rol: perfil.rol || "asesor",
    telefono: normalizarTelefono(perfil.telefono || ""),
    telefonoWhatsapp: normalizarTelefono(rawTel),
    ultimoTexto: ultimo?.texto || "",
    ultimoAt: ultimo?.createdAt || null,
    ultimaDireccion: ultimo?.direccion || null,
    telegramChatId: perfil.telegram_chat_id || null,
  };

  return {
    mensajes,
    asesor: asesorResumen,
  };
}

/**
 * Envía un mensaje de texto al WhatsApp del asesor a través de Evolution API (Línea Rescate)
 * y lo registra en mensajes_whatsapp para bitácora y visualización inmediata.
 */
export async function enviarMensajeAsesorAction(
  asesorId: string,
  texto: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!texto.trim()) return { ok: false, error: "El mensaje está vacío." };

    const sb = supabaseServidor();
    const u = await usuarioActual();
    const { data: yo } = u
      ? await sb.from("perfiles").select("nombre").eq("id", u.id).maybeSingle()
      : { data: null };

    const { data: perfil } = await sb
      .from("perfiles")
      .select("id, nombre, telefono, telefono_whatsapp")
      .eq("id", asesorId)
      .maybeSingle();

    if (!perfil) return { ok: false, error: "Asesor no encontrado." };

    const telDestino = normalizarTelefono(perfil.telefono_whatsapp || perfil.telefono || "");
    if (!telDestino) return { ok: false, error: "El asesor no tiene teléfono configurado." };

    // 1. Enviar mensaje por Evolution API
    const resEnvio = await enviarMensajeTextoEvolution(telDestino, texto.trim());
    if (!resEnvio.ok) {
      return { ok: false, error: resEnvio.error || "Fallo al enviar por Evolution API." };
    }

    // 2. Guardar en mensajes_whatsapp
    await sb.from("mensajes_whatsapp").insert({
      telefono: telDestino,
      direccion: "out",
      texto: texto.trim(),
      wa_message_id: resEnvio.messageId || null,
      estado: "enviado",
      agente: yo?.nombre || "CRM",
    });

    return { ok: true, messageId: resEnvio.messageId };
  } catch (err: any) {
    console.error("[enviarMensajeAsesorAction] Error:", err);
    return { ok: false, error: err?.message || "Error al enviar mensaje al asesor." };
  }
}
