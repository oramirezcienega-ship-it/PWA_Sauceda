"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import {
  generarTokenPortal,
  listarCoordinacionesConRetro,
  listarLeadsConRetro,
  obtenerOCrearTokenPortal,
  urlPortalAsesor,
  type CoordinacionPortal,
  type LeadCompartidoPortal,
} from "@/lib/portal-asesor";

/**
 * Sección "Coordinaciones de Inspección" del CRM: todas las coordinaciones y los
 * clientes compartidos con la retroalimentación de los asesores, más los links
 * personales del portal.
 */

export interface LinkPortalAsesor {
  asesorId: string;
  nombre: string;
  rol: string;
  telefono: string;
  url: string | null;
}

export async function obtenerSeguimientoAsesores(): Promise<{
  coordinaciones: CoordinacionPortal[];
  leads: LeadCompartidoPortal[];
}> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const [coordinaciones, leads] = await Promise.all([
    listarCoordinacionesConRetro(sb, { incluirCanceladas: true, dias: 90 }),
    listarLeadsConRetro(sb, { dias: 90 }),
  ]);
  return { coordinaciones, leads };
}

export async function listarLinksPortalAsesores(): Promise<LinkPortalAsesor[]> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, rol, telefono, portal_token, activo")
    .eq("activo", true)
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data || []).map((p: any) => ({
    asesorId: p.id,
    nombre: p.nombre,
    rol: p.rol,
    telefono: p.telefono || "",
    url: p.portal_token ? urlPortalAsesor(p.portal_token) : null,
  }));
}

/** Crea el link si el asesor aún no tiene uno. */
export async function crearLinkPortalAsesor(asesorId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireAdministrador();
  const token = await obtenerOCrearTokenPortal(supabaseServidor(), asesorId);
  if (!token) return { ok: false, error: "No se pudo crear el link." };
  revalidatePath("/coordinaciones");
  return { ok: true, url: urlPortalAsesor(token) };
}

/** Genera un link nuevo; el anterior deja de funcionar. */
export async function regenerarLinkPortalAsesor(asesorId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireAdministrador();
  const token = generarTokenPortal();
  const { error } = await supabaseServidor().from("perfiles").update({ portal_token: token }).eq("id", asesorId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coordinaciones");
  return { ok: true, url: urlPortalAsesor(token) };
}
