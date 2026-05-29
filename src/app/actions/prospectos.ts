"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import {
  aExpediente,
  aProspecto,
  aFilaProspecto,
  type FilaExpediente,
  type FilaProspecto,
} from "@/lib/supabase/mapeo";
import { ORIGENES } from "@/lib/origenes";
import { registrarActividad } from "@/lib/actividades";
import type {
  DatosProspecto,
  Expediente,
  OrigenAdquisicion,
  Prospecto,
} from "@/lib/types";

/**
 * Server actions del módulo PROSPECTOS (CRM de personas).
 * Todas exigen sesión de admin.
 */

/** Genera el siguiente folio correlativo (PRO-00N). */
function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `PRO-${String(max + 1).padStart(3, "0")}`;
}

/** Lista todos los prospectos. */
export async function listarProspectos(): Promise<Prospecto[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("prospectos")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaProspecto[]).map(aProspecto);
}

/** Obtiene un prospecto con sus expedientes relacionados. */
export async function obtenerProspecto(
  id: string,
): Promise<{ prospecto: Prospecto; expedientes: Expediente[] } | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: filaProspecto, error } = await sb
    .from("prospectos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!filaProspecto) return null;

  const { data: filasExp, error: errExp } = await sb
    .from("expedientes")
    .select("*")
    .eq("prospecto_id", id)
    .order("id", { ascending: true });
  if (errExp) throw new Error(errExp.message);

  return {
    prospecto: aProspecto(filaProspecto as FilaProspecto),
    expedientes: (filasExp as FilaExpediente[]).map(aExpediente),
  };
}

/** Crea un prospecto y devuelve el registro creado. */
export async function crearProspecto(
  datos: DatosProspecto,
): Promise<Prospecto> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: existentes, error: errLista } = await sb
    .from("prospectos")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const { data, error } = await sb
    .from("prospectos")
    .insert({ id, ...aFilaProspecto(datos) })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await registrarActividad(sb, {
    prospectoId: id,
    tipo: "creacion",
    titulo: "Prospecto creado",
  });
  return aProspecto(data as FilaProspecto);
}

/** Actualiza un prospecto. */
export async function actualizarProspecto(
  id: string,
  datos: DatosProspecto,
): Promise<Prospecto> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("prospectos")
    .update(aFilaProspecto(datos))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Sincroniza los campos compartidos (nombre + teléfono) hacia los
  // expedientes enlazados a este prospecto.
  await sb
    .from("expedientes")
    .update({
      cliente: datos.nombre,
      primer_apellido: datos.primerApellido,
      segundo_apellido: datos.segundoApellido,
      telefono: datos.telefono,
      ad_name: datos.adName,
      adset_name: datos.adsetName,
      campaign_name: datos.campaignName,
    })
    .eq("prospecto_id", id);

  return aProspecto(data as FilaProspecto);
}

/** Elimina un prospecto (sus expedientes quedan sin prospecto). */
export async function eliminarProspecto(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("prospectos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Importa prospectos desde filas de un CSV.
 * Columnas: nombre, telefono, correo, direccion, ciudad, origen, valor_campana.
 * Solo "nombre" es obligatorio.
 */
export async function importarProspectos(
  filas: Record<string, string>[],
): Promise<{ importados: number; errores: string[] }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const errores: string[] = [];

  const { data: existentes } = await sb.from("prospectos").select("id");
  let n = Math.max(
    0,
    ...(existentes ?? [])
      .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
      .filter((x) => !Number.isNaN(x)),
  );

  const origenesValidos = ORIGENES.map((o) => o.id) as string[];
  const aInsertar: Record<string, unknown>[] = [];

  filas.forEach((f, idx) => {
    const nombre = (f.nombre ?? "").trim();
    if (!nombre) {
      errores.push(`Fila ${idx + 1}: falta "nombre".`);
      return;
    }
    let origen = (f.origen ?? "otro").trim().toLowerCase();
    if (!origenesValidos.includes(origen)) origen = "otro";
    n++;
    aInsertar.push({
      id: `PRO-${String(n).padStart(3, "0")}`,
      nombre,
      primer_apellido: (f.primer_apellido ?? "").trim(),
      segundo_apellido: (f.segundo_apellido ?? "").trim(),
      telefono: (f.telefono ?? "").trim(),
      correo: (f.correo ?? "").trim(),
      direccion: (f.direccion ?? "").trim(),
      ciudad: (f.ciudad ?? "").trim(),
      origen: origen as OrigenAdquisicion,
      valor_campana: parseInt((f.valor_campana ?? "").replace(/[^\d]/g, ""), 10) || 0,
      ad_name: (f.ad_name ?? "").trim(),
      adset_name: (f.adset_name ?? "").trim(),
      campaign_name: (f.campaign_name ?? "").trim(),
    });
  });

  if (aInsertar.length > 0) {
    const { error } = await sb.from("prospectos").insert(aInsertar);
    if (error) {
      errores.push(`Error al insertar: ${error.message}`);
      return { importados: 0, errores };
    }
  }
  return { importados: aInsertar.length, errores };
}

/** Lista mínima (id + nombre completo) para selects de formularios. */
export async function listarProspectosMin(): Promise<
  { id: string; nombre: string }[]
> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("prospectos")
    .select("id, nombre, primer_apellido, segundo_apellido")
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (r: {
      id: string;
      nombre: string;
      primer_apellido: string;
      segundo_apellido: string;
    }) => ({
      id: r.id,
      nombre: [r.nombre, r.primer_apellido, r.segundo_apellido]
        .filter(Boolean)
        .join(" "),
    }),
  );
}
