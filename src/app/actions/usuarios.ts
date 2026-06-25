"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import {
  requireAdministrador,
  rolDe,
  usuarioActual,
} from "@/lib/supabase/cliente-sesion";

/**
 * Server actions del módulo USUARIOS (gestión del equipo operativo).
 * Requieren rol de administrador (salvo `rolUsuarioActual`).
 */

export interface UsuarioApp {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "asesor";
  activo: boolean;
  telefono: string;
  telefono_desvio?: string;
  disponible_llamadas?: boolean;
  horario_inicio?: string;
  horario_fin?: string;
}

/** Rol del usuario actual (para la UI). No lanza error. */
export async function rolUsuarioActual(): Promise<"admin" | "asesor" | null> {
  try {
    const u = await usuarioActual();
    if (!u) return null;
    const { rol } = await rolDe(u.id);
    return rol;
  } catch {
    return null;
  }
}

/** Perfil completo del usuario actual (para la UI). */
export async function obtenerUsuarioActual(): Promise<{ id: string; email: string; nombre: string; rol: "admin" | "asesor" } | null> {
  try {
    const u = await usuarioActual();
    if (!u) return null;
    const { rol } = await rolDe(u.id);
    const sb = supabaseServidor();
    const { data } = await sb
      .from("perfiles")
      .select("nombre")
      .eq("id", u.id)
      .maybeSingle();
    return {
      id: u.id,
      email: u.email || "",
      nombre: (data as any)?.nombre || u.email || "",
      rol
    };
  } catch {
    return null;
  }
}


/** Lista los usuarios del sistema con su perfil. */
export async function listarUsuarios(): Promise<UsuarioApp[]> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { data: lista, error } = await sb.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  const { data: perfiles } = await sb.from("perfiles").select("*");
  const mapa = new Map(
    (perfiles ?? []).map((p) => [
      p.id as string,
      p as {
        nombre: string;
        rol: "admin" | "asesor";
        activo: boolean;
        telefono?: string;
        telefono_desvio?: string;
        disponible_llamadas?: boolean;
        horario_inicio?: string;
        horario_fin?: string;
      },
    ]),
  );
  return (lista?.users ?? []).map((u) => {
    const p = mapa.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      nombre: p?.nombre ?? "",
      rol: p?.rol ?? "admin",
      activo: p?.activo ?? true,
      telefono: p?.telefono ?? "",
      telefono_desvio: p?.telefono_desvio ?? "",
      disponible_llamadas: p?.disponible_llamadas ?? false,
      horario_inicio: p?.horario_inicio ?? "09:00:00",
      horario_fin: p?.horario_fin ?? "18:00:00",
    };
  });
}

/** Crea un usuario nuevo (correo + contraseña + nombre + rol + teléfono). */
export async function crearUsuario(datos: {
  email: string;
  password: string;
  nombre: string;
  rol: "admin" | "asesor";
  telefono: string;
}): Promise<{ ok: boolean; mensaje?: string }> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { data, error } = await sb.auth.admin.createUser({
    email: datos.email.trim(),
    password: datos.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { ok: false, mensaje: error?.message ?? "No se pudo crear." };
  }
  const { error: errPerfil } = await sb.from("perfiles").insert({
    id: data.user.id,
    nombre: datos.nombre.trim(),
    rol: datos.rol,
    telefono: datos.telefono.trim(),
    telefono_desvio: datos.telefono.trim(), // Por defecto igual al teléfono principal
    disponible_llamadas: false,
    horario_inicio: "09:00:00",
    horario_fin: "18:00:00",
  });
  if (errPerfil) return { ok: false, mensaje: errPerfil.message };
  return { ok: true };
}

/** Actualiza el perfil de un usuario (nombre, rol, activo, teléfono, etc.). */
export async function actualizarUsuario(
  id: string,
  datos: {
    nombre: string;
    rol: "admin" | "asesor";
    activo: boolean;
    telefono: string;
    telefono_desvio?: string;
    disponible_llamadas?: boolean;
    horario_inicio?: string;
    horario_fin?: string;
  },
): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("perfiles")
    .upsert({ id, ...datos });
  if (error) throw new Error(error.message);
}

/** Elimina un usuario (auth + perfil en cascada). */
export async function eliminarUsuario(id: string): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}
