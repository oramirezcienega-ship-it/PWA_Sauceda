"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import {
  requireAdmin,
  requireAdministrador,
  rolDe,
  usuarioActual,
} from "@/lib/supabase/cliente-sesion";
import { notificarAsignacionOperarioACliente } from "@/lib/notificaciones-sistema";
import { validarAgendaOperador } from "@/app/actions/agenda";

/**
 * Server actions del módulo USUARIOS (gestión del equipo operativo).
 * Requieren rol de administrador (salvo `rolUsuarioActual`).
 */

export interface UsuarioApp {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "asesor" | "operaciones";
  activo: boolean;
  telefono: string;
  telefono_desvio?: string;
  disponible_llamadas?: boolean;
  horario_inicio?: string;
  horario_fin?: string;
  horarios_guardia?: Record<string, { inicio: string; fin: string }[]>;
}

/** Rol del usuario actual (para la UI). No lanza error. */
export async function rolUsuarioActual(): Promise<"admin" | "asesor" | "operaciones" | null> {
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
export async function obtenerUsuarioActual(): Promise<{ id: string; email: string; nombre: string; rol: "admin" | "asesor" | "operaciones" } | null> {
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
        rol: "admin" | "asesor" | "operaciones";
        activo: boolean;
        telefono?: string;
        telefono_desvio?: string;
        disponible_llamadas?: boolean;
        horario_inicio?: string;
        horario_fin?: string;
        horarios_guardia?: any;
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
      horarios_guardia: p?.horarios_guardia ?? {
        lunes: [{ inicio: "09:00:00", fin: "18:00:00" }],
        martes: [{ inicio: "09:00:00", fin: "18:00:00" }],
        miercoles: [{ inicio: "09:00:00", fin: "18:00:00" }],
        jueves: [{ inicio: "09:00:00", fin: "18:00:00" }],
        viernes: [{ inicio: "09:00:00", fin: "18:00:00" }],
        sabado: [],
        domingo: []
      }
    };
  });
}

/** Crea un usuario nuevo (correo + contraseña + nombre + rol + teléfono). */
export async function crearUsuario(datos: {
  email: string;
  password: string;
  nombre: string;
  rol: "admin" | "asesor" | "operaciones";
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
    rol: "admin" | "asesor" | "operaciones";
    activo: boolean;
    telefono: string;
    telefono_desvio?: string;
    disponible_llamadas?: boolean;
    horario_inicio?: string;
    horario_fin?: string;
    horarios_guardia?: Record<string, { inicio: string; fin: string }[]>;
  },
): Promise<void> {
  await requireAdministrador();
  
  // Evitar auto-bloqueo o pérdida de rol administrador
  const uActual = await usuarioActual();
  if (uActual && uActual.id === id) {
    if (datos.activo === false) {
      throw new Error("No puedes desactivar tu propio usuario administrador.");
    }
    if (datos.rol !== "admin") {
      throw new Error("No puedes cambiar tu propio rol de administrador.");
    }
  }

  const sb = supabaseServidor();

  // Filtrar undefined para evitar errores de serialización de Supabase
  const updateData: Record<string, any> = {};
  for (const key in datos) {
    if ((datos as any)[key] !== undefined) {
      updateData[key] = (datos as any)[key];
    }
  }

  const { error } = await sb
    .from("perfiles")
    .update(updateData)
    .eq("id", id);
    
  if (error) throw new Error(error.message);
}

/** Restablece la contraseña de un usuario usando el cliente admin de Supabase. */
export async function actualizarPasswordUsuario(id: string, nuevoPassword: string): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { error } = await sb.auth.admin.updateUserById(id, {
    password: nuevoPassword,
  });
  if (error) throw new Error(error.message);
}

/** Elimina un usuario (auth + perfil en cascada). */
export async function eliminarUsuario(id: string): Promise<void> {
  await requireAdministrador();

  // Evitar auto-eliminación
  const uActual = await usuarioActual();
  if (uActual && uActual.id === id) {
    throw new Error("No puedes eliminar tu propio usuario administrador.");
  }

  const sb = supabaseServidor();
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}

/** Obtiene una lista simplificada de asesores/usuarios activos para selects. */
export async function listarAsesoresActivos(): Promise<{ id: string; nombre: string }[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; nombre: string }[];
}

/** Reasigna un asesor a un expediente o prospecto con sincronización bidireccional. */
export async function reasignarAsesor(
  id: string,
  tipo: "expediente" | "prospecto",
  asesorId: string | null,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  if (tipo === "expediente") {
    // 1. Obtener prospecto_id de este expediente
    const { data: exp } = await sb
      .from("expedientes")
      .select("prospecto_id")
      .eq("id", id)
      .maybeSingle();

    // 2. Actualizar el expediente
    const { error: errExp } = await sb
      .from("expedientes")
      .update({
        asesor_id: asesorId,
        ultimo_movimiento: new Date().toISOString().slice(0, 10),
      })
      .eq("id", id);
    if (errExp) throw new Error(errExp.message);

    // 3. Sincronizar bidireccionalmente con el prospecto
    if (exp?.prospecto_id) {
      await sb
        .from("prospectos")
        .update({ asesor_id: asesorId })
        .eq("id", exp.prospecto_id);
    }
  } else {
    // 1. Actualizar el prospecto
    const { error: errPros } = await sb
      .from("prospectos")
      .update({ asesor_id: asesorId })
      .eq("id", id);
    if (errPros) throw new Error(errPros.message);

    // 2. Sincronizar bidireccionalmente con todos los expedientes de este prospecto
    await sb
      .from("expedientes")
      .update({
        asesor_id: asesorId,
        ultimo_movimiento: new Date().toISOString().slice(0, 10),
      })
      .eq("prospecto_id", id);
  }
}

/** Obtiene una lista de operarios activos para selects. */
export async function listarOperariosActivos(): Promise<{ id: string; nombre: string }[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre")
    .eq("activo", true)
    .eq("rol", "operaciones")
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; nombre: string }[];
}

/** Reasigna un operador a un expediente o prospecto con sincronización bidireccional. */
export async function reasignarOperador(
  id: string,
  tipo: "expediente" | "prospecto",
  operadorId: string | null,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  if (operadorId) {
    const agendaValida = await validarAgendaOperador(operadorId);
    if (!agendaValida) {
      throw new Error(
        "El operario seleccionado no tiene horarios disponibles configurados o libres en los próximos 14 días.",
      );
    }
  }

  if (tipo === "expediente") {
    const { data: exp } = await sb
      .from("expedientes")
      .select("prospecto_id")
      .eq("id", id)
      .maybeSingle();

    const { error: errExp } = await sb
      .from("expedientes")
      .update({
        operador_id: operadorId,
        ultimo_movimiento: new Date().toISOString().slice(0, 10),
      })
      .eq("id", id);
    if (errExp) throw new Error(errExp.message);

    if (exp?.prospecto_id) {
      await sb
        .from("prospectos")
        .update({ operador_id: operadorId })
        .eq("id", exp.prospecto_id);
    }

    if (operadorId) {
      void notificarAsignacionOperarioACliente(sb, id, exp?.prospecto_id || null, operadorId);
    }
  } else {
    const { error: errPros } = await sb
      .from("prospectos")
      .update({ operador_id: operadorId })
      .eq("id", id);
    if (errPros) throw new Error(errPros.message);

    const { data: exp } = await sb
      .from("expedientes")
      .select("id")
      .eq("prospecto_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await sb
      .from("expedientes")
      .update({
        operador_id: operadorId,
        ultimo_movimiento: new Date().toISOString().slice(0, 10),
      })
      .eq("prospecto_id", id);

    if (operadorId) {
      void notificarAsignacionOperarioACliente(sb, exp?.id || null, id, operadorId);
    }
  }
}

/** Lista todos los perfiles activos para asignación. */
export async function listarPerfilesActivos(): Promise<{ id: string; nombre: string; rol: string }[]> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, rol")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}


