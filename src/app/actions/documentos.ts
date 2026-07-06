"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { enviarWhatsAppDocumento } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";
import { variantesTelefono } from "@/lib/telefono";

/** Nombre del asesor actual (desde perfiles). */
async function nombreAsesorActual(): Promise<string | null> {
  const sb = supabaseServidor();
  const { createServerClient } = await import("@supabase/ssr");
  const { cookies } = await import("next/headers");
  const cookieStore = cookies();
  const sbSesion = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const { data: { user } } = await sbSesion.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("perfiles").select("nombre").eq("id", user.id).maybeSingle();
  return (data as { nombre?: string } | null)?.nombre ?? null;
}

export interface DocumentoVenta {
  id: string;
  nombre: string;
  descripcion: string | null;
  url: string;
  nombre_archivo: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  subido_por: string | null;
  created_at: string;
}

/** Lista todos los documentos subidos. */
export async function listarDocumentos(): Promise<DocumentoVenta[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("documentos_ventas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentoVenta[];
}

/** Sube un documento al bucket de Supabase Storage y lo registra en la BD. */
export async function subirDocumento(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const nombreAsesor = await nombreAsesorActual();

  const archivo = formData.get("archivo") as File | null;
  const nombre = (formData.get("nombre") as string | null)?.trim() || "";
  const descripcion = (formData.get("descripcion") as string | null)?.trim() || null;

  if (!archivo || archivo.size === 0) return { ok: false, error: "No se adjuntó ningún archivo." };
  if (!nombre) return { ok: false, error: "El nombre del documento es requerido." };

  const MAX_MB = 16;
  if (archivo.size > MAX_MB * 1024 * 1024) {
    return { ok: false, error: `El archivo supera el límite de ${MAX_MB} MB.` };
  }

  const ext = archivo.name.split(".").pop() ?? "";
  const path = `${Date.now()}-${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const buffer = Buffer.from(await archivo.arrayBuffer());

  const { data: uploadData, error: uploadError } = await sb.storage
    .from("documentos-ventas")
    .upload(path, buffer, {
      contentType: archivo.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = sb.storage
    .from("documentos-ventas")
    .getPublicUrl(uploadData.path);

  const { error: insertError } = await sb.from("documentos_ventas").insert({
    nombre,
    descripcion,
    url: urlData.publicUrl,
    nombre_archivo: archivo.name,
    tipo_mime: archivo.type || null,
    tamano_bytes: archivo.size,
    subido_por: nombreAsesor,
  });

  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true };
}

/** Elimina un documento de la BD y del storage. */
export async function eliminarDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: doc } = await sb
    .from("documentos_ventas")
    .select("url, nombre_archivo")
    .eq("id", id)
    .maybeSingle();

  if (doc?.url) {
    // Extrae el path relativo dentro del bucket desde la URL pública
    const match = doc.url.match(/documentos-ventas\/(.+)$/);
    if (match) {
      await sb.storage.from("documentos-ventas").remove([match[1]]);
    }
  }

  const { error } = await sb.from("documentos_ventas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Envía un documento de la biblioteca a un número de WhatsApp. */
export async function enviarDocumentoConversacion(
  telefono: string,
  documentoId: string,
  caption?: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const nombreAsesor = await nombreAsesorActual();

  const { data: doc } = await sb
    .from("documentos_ventas")
    .select("*")
    .eq("id", documentoId)
    .maybeSingle();

  if (!doc) return { ok: false, error: "Documento no encontrado." };

  const result = await enviarWhatsAppDocumento(telefono, doc.url, doc.nombre_archivo, caption, doc.tipo_mime);
  if (!result.ok) return result;

  // Registrar el envío en mensajes_whatsapp
  const variantes = variantesTelefono(telefono);

  const { data: ref } = await sb
    .from("mensajes_whatsapp")
    .select("expediente_id, prospecto_id")
    .in("telefono", variantes)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await sb.from("mensajes_whatsapp").insert({
    telefono,
    texto: `📎 Documento enviado: ${doc.nombre}${caption ? ` — "${caption}"` : ""}`,
    direccion: "out",
    estado: "enviado",
    agente: nombreAsesor ?? "Sistema",
    wa_message_id: result.messageId ?? null,
    expediente_id: ref?.expediente_id ?? null,
    prospecto_id: ref?.prospecto_id ?? null,
  });

  if (ref?.expediente_id) {
    await registrarActividad(sb, {
      expedienteId: ref.expediente_id,
      tipo: "mensaje",
      titulo: "Documento enviado por WhatsApp",
      detalle: `Se envió el documento "${doc.nombre}" por WhatsApp.`,
    });
  }

  return { ok: true };
}
