"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { notificarCliente } from "@/lib/email";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { aplicarParametros } from "@/lib/parametros";
import type { DatosMensaje, Mensaje, MensajeEnviado } from "@/lib/types";

/**
 * Server actions del módulo MENSAJES.
 * Las del admin exigen sesión. La pública (obtenerMensajesPorToken) la usa
 * el portal del cliente y valida por el token del expediente.
 */

interface FilaMensaje {
  id: string;
  titulo: string;
  texto: string;
}
interface FilaEnviado {
  id: string;
  expediente_id: string;
  titulo: string;
  texto: string;
}

function aMensaje(f: FilaMensaje): Mensaje {
  return { id: f.id, titulo: f.titulo, texto: f.texto };
}
function aEnviado(f: FilaEnviado): MensajeEnviado {
  return {
    id: f.id,
    expedienteId: f.expediente_id,
    titulo: f.titulo,
    texto: f.texto,
  };
}

function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `MSG-${String(max + 1).padStart(3, "0")}`;
}

// ---------- Admin: CRUD de plantillas ----------

export async function listarMensajes(): Promise<Mensaje[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaMensaje[]).map(aMensaje);
}

export async function obtenerMensaje(id: string): Promise<Mensaje | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aMensaje(data as FilaMensaje) : null;
}

export async function crearMensaje(datos: DatosMensaje): Promise<Mensaje> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: existentes, error: errLista } = await sb
    .from("mensajes")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));
  const { data, error } = await sb
    .from("mensajes")
    .insert({ id, ...datos })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aMensaje(data as FilaMensaje);
}

export async function actualizarMensaje(
  id: string,
  datos: DatosMensaje,
): Promise<Mensaje> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes")
    .update(datos)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aMensaje(data as FilaMensaje);
}

export async function eliminarMensaje(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("mensajes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Admin: mensajes enviados a expedientes ----------

export async function enviarMensaje(
  expedienteId: string,
  titulo: string,
  texto: string,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("mensajes_enviados")
    .insert({ expediente_id: expedienteId, titulo, texto });
  if (error) throw new Error(error.message);
  await registrarActividad(sb, {
    expedienteId,
    tipo: "mensaje",
    titulo: `Mensaje enviado: ${titulo}`,
    detalle: texto,
  });
  // Notificación por correo al cliente (sin mostrar el título interno).
  await notificarCliente(
    sb,
    expedienteId,
    "Tienes un mensaje de SAUCEDA Bienes Raíces",
    "",
    texto,
  );
}

/**
 * Notifica un mensaje al cliente por WhatsApp usando la Cloud API
 * (sin abrir WhatsApp Web). Resuelve los parámetros ({nombre}, etc.) y
 * adjunta el enlace al portal. Devuelve el resultado para el asesor.
 */
export async function notificarMensajeWhatsApp(
  expedienteId: string,
  texto: string,
): Promise<{ ok: boolean; mensaje: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data } = await sb
    .from("expedientes")
    .select(
      "token, telefono, cliente, primer_apellido, segundo_apellido, fraccionamiento",
    )
    .eq("id", expedienteId)
    .maybeSingle();
  if (!data) return { ok: false, mensaje: "Expediente no encontrado." };
  const d = data as {
    token: string;
    telefono: string | null;
    cliente: string | null;
    primer_apellido: string | null;
    segundo_apellido: string | null;
    fraccionamiento: string | null;
  };
  if (!d.telefono) {
    return { ok: false, mensaje: "El expediente no tiene teléfono." };
  }

  const nombreCompleto = [d.cliente, d.primer_apellido, d.segundo_apellido]
    .filter(Boolean)
    .join(" ");
  const params = {
    nombre: d.cliente ?? "",
    primer_apellido: d.primer_apellido ?? "",
    segundo_apellido: d.segundo_apellido ?? "",
    nombre_completo: nombreCompleto,
    fraccionamiento: d.fraccionamiento ?? "",
  };
  const base = process.env.SITE_URL || "https://crm.saucedamx.com";
  const url = `${base}/seguimiento/${d.token}`;
  const cuerpo = `${aplicarParametros(texto, params)}\n\nVer en tu portal: ${url}`;

  const r = await enviarWhatsAppTexto(d.telefono, cuerpo);
  if (!r.ok) {
    return { ok: false, mensaje: r.error ?? "No se pudo enviar el WhatsApp." };
  }
  await registrarActividad(sb, {
    expedienteId,
    tipo: "mensaje",
    titulo: "Mensaje notificado por WhatsApp",
    detalle: aplicarParametros(texto, params),
  });
  return { ok: true, mensaje: "Notificado por WhatsApp ✓" };
}

export async function listarMensajesDeExpediente(
  expedienteId: string,
): Promise<MensajeEnviado[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes_enviados")
    .select("*")
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaEnviado[]).map(aEnviado);
}

export async function eliminarMensajeEnviado(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("mensajes_enviados").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Público: portal del cliente ----------

export async function obtenerMensajesPorToken(
  token: string,
): Promise<MensajeEnviado[]> {
  const sb = supabaseServidor();
  const { data: exp } = await sb
    .from("expedientes")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (!exp) return [];
  const { data, error } = await sb
    .from("mensajes_enviados")
    .select("*")
    .eq("expediente_id", (exp as { id: string }).id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaEnviado[]).map(aEnviado);
}
