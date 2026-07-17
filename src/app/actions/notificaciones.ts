"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";

export interface NotificacionApp {
  id: string;
  perfil_id: string;
  titulo: string;
  cuerpo: string;
  leido: boolean;
  enlace: string | null;
  created_at: string;
}

/** Obtiene las últimas 50 notificaciones del usuario autenticado. */
export async function listarNotificaciones(): Promise<NotificacionApp[]> {
  try {
    const u = await usuarioActual();
    if (!u) return [];

    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("notificaciones")
      .select("*")
      .eq("perfil_id", u.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return (data as NotificacionApp[]) ?? [];
  } catch (err) {
    console.error("Error al listar notificaciones:", err);
    return [];
  }
}

/** Marca una notificación específica como leída. */
export async function marcarNotificacionLeida(id: string): Promise<void> {
  try {
    const u = await usuarioActual();
    if (!u) return;

    const sb = supabaseServidor();
    const { error } = await sb
      .from("notificaciones")
      .update({ leido: true })
      .eq("id", id)
      .eq("perfil_id", u.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("Error al marcar notificación como leída:", err);
  }
}

/** Marca todas las notificaciones pendientes del usuario actual como leídas. */
export async function marcarTodasComoLeidas(): Promise<void> {
  try {
    const u = await usuarioActual();
    if (!u) return;

    const sb = supabaseServidor();
    const { error } = await sb
      .from("notificaciones")
      .update({ leido: true })
      .eq("perfil_id", u.id)
      .eq("leido", false);

    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("Error al marcar todas las notificaciones como leídas:", err);
  }
}

/** Elimina una notificación del historial. */
export async function eliminarNotificacion(id: string): Promise<void> {
  try {
    const u = await usuarioActual();
    if (!u) return;

    const sb = supabaseServidor();
    const { error } = await sb
      .from("notificaciones")
      .delete()
      .eq("id", id)
      .eq("perfil_id", u.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("Error al eliminar notificación:", err);
  }
}

/** Elimina todas las notificaciones del historial del usuario actual. */
export async function eliminarTodasLasNotificaciones(): Promise<void> {
  try {
    const u = await usuarioActual();
    if (!u) return;

    const sb = supabaseServidor();
    const { error } = await sb
      .from("notificaciones")
      .delete()
      .eq("perfil_id", u.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("Error al eliminar todas las notificaciones:", err);
  }
}
