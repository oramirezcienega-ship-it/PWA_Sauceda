"use server";

import { revalidatePath } from "next/cache";
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
  notificar_whatsapp_nuevo_lead?: boolean;
  asignacion_automatica?: boolean;
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
  
  // Determinar si hay al menos uno con asignacion_automatica = true
  const tieneAsignado = (perfiles ?? []).some((p: any) => p.asignacion_automatica === true);

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
        notificar_whatsapp_nuevo_lead?: boolean;
        asignacion_automatica?: boolean;
      },
    ]),
  );

  const usuariosResult = (lista?.users ?? []).map((u) => {
    const p = mapa.get(u.id);
    const esGerardoFallback = !tieneAsignado && (p?.nombre ?? "").toLowerCase().includes("gerardo");
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
      },
      notificar_whatsapp_nuevo_lead: p?.notificar_whatsapp_nuevo_lead ?? (p?.rol === "admin" || (p?.nombre ?? "").toLowerCase().includes("oscar")),
      asignacion_automatica: p?.asignacion_automatica ?? esGerardoFallback,
    };
  });

  // Si aún nadie tiene asignacion_automatica activada, activar en el primer usuario activo
  if (!usuariosResult.some(u => u.asignacion_automatica) && usuariosResult.length > 0) {
    const primerAsesorOAdmin = usuariosResult.find(u => u.activo && (u.rol === "asesor" || u.rol === "admin")) || usuariosResult[0];
    if (primerAsesorOAdmin) {
      primerAsesorOAdmin.asignacion_automatica = true;
    }
  }

  return usuariosResult;
}

/** Crea un usuario nuevo (correo + contraseña + nombre + rol + teléfono + notificaciones). */
export async function crearUsuario(datos: {
  email: string;
  password: string;
  nombre: string;
  rol: "admin" | "asesor" | "operaciones";
  telefono: string;
  notificar_whatsapp_nuevo_lead?: boolean;
  asignacion_automatica?: boolean;
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

  if (datos.asignacion_automatica) {
    await sb.from("perfiles").update({ asignacion_automatica: false }).neq("id", data.user.id);
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
    notificar_whatsapp_nuevo_lead: datos.notificar_whatsapp_nuevo_lead ?? (datos.rol === "admin"),
    asignacion_automatica: datos.asignacion_automatica ?? false,
  });
  if (errPerfil) return { ok: false, mensaje: errPerfil.message };
  revalidatePath("/usuarios");
  return { ok: true };
}

/** Establece un usuario como el receptor único de asignación automática de leads. */
export async function establecerAsesorAsignacionAutomatica(id: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();
    
    // 1. Quitar asignación automática a todos los demás perfiles
    try {
      await sb
        .from("perfiles")
        .update({ asignacion_automatica: false })
        .neq("id", id);
    } catch {
      // Ignorar si la columna no existe aún en la base de datos
    }

    // 2. Marcar al usuario seleccionado
    const { error } = await sb
      .from("perfiles")
      .update({ asignacion_automatica: true })
      .eq("id", id);

    if (error) {
      if (error.message.includes("asignacion_automatica")) {
        return {
          ok: false,
          mensaje: "Para usar la asignación automática, es necesario ejecutar primero la migración 0069 en la consola SQL de Supabase.",
        };
      }
      return { ok: false, mensaje: error.message };
    }
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, mensaje: err?.message || "Error al establecer asignación automática." };
  }
}

/** Actualiza el perfil de un usuario (nombre, rol, activo, teléfono, notificaciones, etc.). */
export async function actualizarUsuario(
  id: string,
  datos: {
    nombre?: string;
    rol?: "admin" | "asesor" | "operaciones";
    activo?: boolean;
    telefono?: string;
    telefono_desvio?: string;
    disponible_llamadas?: boolean;
    horario_inicio?: string;
    horario_fin?: string;
    horarios_guardia?: Record<string, { inicio: string; fin: string }[]>;
    notificar_whatsapp_nuevo_lead?: boolean;
    asignacion_automatica?: boolean;
  },
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdministrador();

    // Evitar auto-bloqueo o pérdida de rol administrador
    const uActual = await usuarioActual();
    if (uActual && uActual.id === id) {
      if (datos.activo === false) {
        return { ok: false, mensaje: "No puedes desactivar tu propio usuario administrador." };
      }
      if (datos.rol !== undefined && datos.rol !== "admin") {
        return { ok: false, mensaje: "No puedes cambiar tu propio rol de administrador." };
      }
    }

    const sb = supabaseServidor();

    if (datos.asignacion_automatica === true) {
      try {
        await sb
          .from("perfiles")
          .update({ asignacion_automatica: false })
          .neq("id", id);
      } catch {
        // Ignorar si la columna no existe en producción aún
      }
    }

    // Columnas que pueden enviarse a la tabla perfiles
    const columnasPerfiles = new Set([
      "nombre", "rol", "activo", "telefono",
      "telefono_desvio", "disponible_llamadas",
      "horario_inicio", "horario_fin", "horarios_guardia",
      "notificar_whatsapp_nuevo_lead",
      "asignacion_automatica",
    ]);

    const updateData: Record<string, any> = {};
    for (const key in datos) {
      if ((datos as any)[key] !== undefined && columnasPerfiles.has(key)) {
        updateData[key] = (datos as any)[key];
      }
    }

    let { error } = await sb
      .from("perfiles")
      .update(updateData)
      .eq("id", id);

    if (error) {
      // Si la BD de producción no tiene columnas opcionales recien agregadas, eliminarlas y reintentar
      let reintentar = false;
      if (error.message.includes("notificar_whatsapp_nuevo_lead")) {
        delete updateData.notificar_whatsapp_nuevo_lead;
        reintentar = true;
      }
      if (error.message.includes("asignacion_automatica")) {
        delete updateData.asignacion_automatica;
        reintentar = true;
      }

      if (reintentar) {
        const { error: errRetry } = await sb.from("perfiles").update(updateData).eq("id", id);
        if (errRetry) {
          return { ok: false, mensaje: errRetry.message };
        }
      } else {
        return { ok: false, mensaje: error.message };
      }
    }
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (err: any) {
    console.error("Error al actualizar usuario:", err);
    return { ok: false, mensaje: err?.message || "Ocurrió un error inesperado al actualizar el usuario." };
  }
}

/** Restablece la contraseña de un usuario usando el cliente admin de Supabase. */
export async function actualizarPasswordUsuario(id: string, nuevoPassword: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();
    const { error } = await sb.auth.admin.updateUserById(id, {
      password: nuevoPassword,
    });
    if (error) return { ok: false, mensaje: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, mensaje: err?.message || "Error al actualizar la contraseña." };
  }
}

/** Elimina un usuario (auth + perfil en cascada). */
export async function eliminarUsuario(id: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdministrador();

    // Evitar auto-eliminación
    const uActual = await usuarioActual();
    if (uActual && uActual.id === id) {
      return { ok: false, mensaje: "No puedes eliminar tu propio usuario administrador." };
    }

    const sb = supabaseServidor();
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) return { ok: false, mensaje: error.message };
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, mensaje: err?.message || "Error al eliminar el usuario." };
  }
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
export async function listarPerfilesActivos(): Promise<{ id: string; nombre: string; rol: string; telefono?: string | null }[]> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, rol, telefono")
    .neq("activo", false)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}


