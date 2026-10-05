"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import { pausarExpediente } from "@/lib/pausa-leads";

async function validarAcceso(expedienteId: string): Promise<string> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();
  const { data: exp } = await sb
    .from("expedientes")
    .select("asesor_id, operador_id")
    .eq("id", expedienteId)
    .maybeSingle();
  if (!exp) throw new Error("Expediente no encontrado.");
  if (rol === "asesor" || rol === "operaciones") {
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if ((exp as any)[colId] !== usuario.id) throw new Error("No estás autorizado para modificar este expediente.");
  }
  const { data: perfil } = await sb.from("perfiles").select("nombre").eq("id", usuario.id).maybeSingle();
  return perfil?.nombre || "Usuario";
}

/** Pone el negocio en pausa hasta `retomarEn` (YYYY-MM-DD). */
export async function posponerExpediente(expedienteId: string, retomarEn: string, motivo?: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retomarEn)) throw new Error("Fecha inválida.");
  const nombre = await validarAcceso(expedienteId);
  const r = await pausarExpediente(supabaseServidor(), {
    expedienteId,
    retomarEn,
    motivo: motivo || null,
    origen: `Pospuesto por ${nombre}`,
  });
  if (!r.ok || !r.retomarEn) throw new Error(r.error || "No se pudo poner en pausa.");
  return r.retomarEn;
}

