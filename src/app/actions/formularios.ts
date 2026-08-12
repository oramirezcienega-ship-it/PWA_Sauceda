"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { notificarCliente } from "@/lib/email";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import type {
  DatosFormulario,
  EnvioConFormulario,
  Formulario,
} from "@/lib/types";

/**
 * Server actions del módulo FORMULARIOS.
 * Las del admin exigen sesión. Las públicas (obtenerEnviosPorToken,
 * responderFormulario) las usa el portal del cliente y validan por token.
 */

interface FilaFormulario {
  id: string;
  titulo: string;
  descripcion: string;
  preguntas: Formulario["preguntas"];
}

function aFormulario(fila: FilaFormulario): Formulario {
  return {
    id: fila.id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    preguntas: fila.preguntas ?? [],
  };
}

interface FilaEnvio {
  id: string;
  formulario_id: string;
  expediente_id: string;
  estado: "pendiente" | "respondido";
  respuestas: Record<string, string>;
  formularios: FilaFormulario | null;
}

function aEnvioConFormulario(fila: FilaEnvio): EnvioConFormulario {
  return {
    id: fila.id,
    formularioId: fila.formulario_id,
    expedienteId: fila.expediente_id,
    estado: fila.estado,
    respuestas: fila.respuestas ?? {},
    formulario: fila.formularios
      ? aFormulario(fila.formularios)
      : { id: fila.formulario_id, titulo: "(formulario)", descripcion: "", preguntas: [] },
  };
}

function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `FORM-${String(max + 1).padStart(3, "0")}`;
}

// ---------- Admin: CRUD de plantillas ----------

export async function listarFormularios(): Promise<Formulario[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("formularios")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaFormulario[]).map(aFormulario);
}

export async function obtenerFormulario(
  id: string,
): Promise<Formulario | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("formularios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aFormulario(data as FilaFormulario) : null;
}

export async function crearFormulario(
  datos: DatosFormulario,
): Promise<Formulario> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: existentes, error: errLista } = await sb
    .from("formularios")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const { data, error } = await sb
    .from("formularios")
    .insert({ id, ...datos })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aFormulario(data as FilaFormulario);
}

export async function actualizarFormulario(
  id: string,
  datos: DatosFormulario,
): Promise<Formulario> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("formularios")
    .update(datos)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aFormulario(data as FilaFormulario);
}

export async function eliminarFormulario(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("formularios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Admin: envíos a expedientes ----------

/** Envía (asigna) un formulario a un expediente. Evita duplicados pendientes. */
export async function enviarFormulario(
  expedienteId: string,
  formularioId: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Evita asignar el mismo formulario dos veces si ya hay uno pendiente.
  const { data: existente } = await sb
    .from("envios_formulario")
    .select("id")
    .eq("expediente_id", expedienteId)
    .eq("formulario_id", formularioId)
    .eq("estado", "pendiente")
    .limit(1);
  if (existente && existente.length > 0) {
    return {
      ok: false,
      mensaje: "Ese formulario ya está pendiente para este cliente.",
    };
  }

  const { error } = await sb.from("envios_formulario").insert({
    formulario_id: formularioId,
    expediente_id: expedienteId,
  });
  if (error) return { ok: false, mensaje: error.message };
  await registrarActividad(sb, {
    expedienteId,
    tipo: "formulario",
    titulo: "Formulario enviado al cliente",
  });
  // Notificación por correo al cliente (si tiene email).
  await notificarCliente(
    sb,
    expedienteId,
    "Tienes un formulario por completar",
    "Formulario por completar",
    "Hola {nombre}, tienes un formulario por completar para tu trámite. Ábrelo en tu portal y respóndelo cuando puedas.",
  );
  return { ok: true };
}

/** Retira (elimina) un envío de formulario de un expediente. */
export async function eliminarEnvio(envioId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("envios_formulario")
    .delete()
    .eq("id", envioId);
  if (error) throw new Error(error.message);
}

/** Lista los envíos de un expediente (con su plantilla). */
export async function listarEnviosDeExpediente(
  expedienteId: string,
): Promise<EnvioConFormulario[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("envios_formulario")
    .select("*, formularios(*)")
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaEnvio[]).map(aEnvioConFormulario);
}

// ---------- Público: portal del cliente (por token) ----------

/** Envíos de formulario del expediente identificado por su token. */
export async function obtenerEnviosPorToken(
  token: string,
): Promise<EnvioConFormulario[]> {
  const sb = supabaseServidor();
  const { data: exp } = await sb
    .from("expedientes")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (!exp) return [];

  const { data, error } = await sb
    .from("envios_formulario")
    .select("*, formularios(*)")
    .eq("expediente_id", (exp as { id: string }).id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaEnvio[]).map(aEnvioConFormulario);
}

/**
 * Sube un archivo (PDF/foto) de un formulario al bucket privado.
 * Validado por el token del expediente. Devuelve la ruta del archivo.
 */
export async function subirArchivoFormulario(
  token: string,
  formData: FormData,
): Promise<string> {
  const sb = supabaseServidor();

  const { data: exp } = await sb
    .from("expedientes")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (!exp) throw new Error("No autorizado.");

  const file = formData.get("archivo");
  if (!(file instanceof File)) throw new Error("Archivo inválido.");

  const ext = (file.name.split(".").pop() || "dat").toLowerCase();
  const ruta = `${token}/${crypto.randomUUID()}.${ext}`;

  let { error } = await sb.storage
    .from("formularios")
    .upload(ruta, file, { contentType: file.type, upsert: false });

  if (error && (error.message.toLowerCase().includes("not found") || error.message.toLowerCase().includes("bucket"))) {
    try {
      await sb.storage.createBucket("formularios", { public: false });
      const retry = await sb.storage
        .from("formularios")
        .upload(ruta, file, { contentType: file.type, upsert: false });
      error = retry.error;
    } catch (e) {
      console.warn("No se pudo crear el bucket formularios automáticamente:", e);
    }
  }

  if (error) throw new Error(error.message);
  return ruta;
}

/** Genera una URL firmada temporal para ver un archivo (solo admin). */
export async function urlArchivoFormulario(ruta: string): Promise<string> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb.storage
    .from("formularios")
    .createSignedUrl(ruta, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** El cliente responde un formulario (validado por el token de su expediente). */
export async function responderFormulario(
  token: string,
  envioId: string,
  respuestas: Record<string, string>,
): Promise<void> {
  const sb = supabaseServidor();

  // Verifica que el envío pertenezca al expediente de ese token.
  const { data: envio } = await sb
    .from("envios_formulario")
    .select("id, expediente_id")
    .eq("id", envioId)
    .maybeSingle();
  if (!envio) throw new Error("Envío no encontrado.");

  const { data: exp } = await sb
    .from("expedientes")
    .select("token")
    .eq("id", (envio as { expediente_id: string }).expediente_id)
    .maybeSingle();
  if (!exp || (exp as { token: string }).token !== token) {
    throw new Error("No autorizado.");
  }

  const { error } = await sb
    .from("envios_formulario")
    .update({
      respuestas,
      estado: "respondido",
      respondido_at: new Date().toISOString(),
    })
    .eq("id", envioId);
  if (error) throw new Error(error.message);

  const expedienteId = (envio as { expediente_id: string }).expediente_id;
  await registrarActividad(sb, {
    expedienteId,
    tipo: "formulario",
    titulo: "El cliente respondió un formulario",
  });
  // Dispara automatizaciones del evento "formulario respondido".
  await dispararEvento(sb, "formulario-respondido", { expedienteId });
}
