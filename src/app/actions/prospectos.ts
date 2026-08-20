"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import {
  aExpediente,
  aProspecto,
  aFilaProspecto,
  type FilaExpediente,
  type FilaProspecto,
} from "@/lib/supabase/mapeo";
import { ORIGENES } from "@/lib/origenes";
import { registrarActividad } from "@/lib/actividades";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import type {
  DatosProspecto,
  Expediente,
  OrigenAdquisicion,
  Prospecto,
  EstatusProspecto,
  CalificacionProspecto,
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

/** Lista todos los prospectos (filtrado si es asesor). */
export async function listarProspectos(): Promise<Prospecto[]> {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);

  const sb = supabaseServidor();
  let query = sb
    .from("prospectos")
    .select("*, asesor:asesor_id(nombre), operador:operador_id(nombre)");

  if (rol === "asesor") {
    query = query.eq("asesor_id", usuario.id);
  } else if (rol === "operaciones") {
    query = query.eq("operador_id", usuario.id);
  }

  const { data, error } = await query.order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaProspecto[]).map(aProspecto);
}

/** Obtiene un prospecto con sus expedientes relacionados. */
export async function obtenerProspecto(
  id: string,
): Promise<{ prospecto: Prospecto; expedientes: Expediente[] } | null> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  const { data: filaProspecto, error } = await sb
    .from("prospectos")
    .select("*, asesor:asesor_id(nombre), operador:operador_id(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!filaProspecto) return null;

  if (rol === "asesor" || rol === "operaciones") {
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if (filaProspecto[colId] !== usuario.id) {
      throw new Error("No estás autorizado para ver este prospecto.");
    }
  }

  const { data: filasExp, error: errExp } = await sb
    .from("expedientes")
    .select("*, prospectos(origen), asesor:asesor_id(nombre), operador:operador_id(nombre)")
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
  // Dispara automatizaciones del evento "nuevo prospecto".
  await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });

  // Enviar evento identify a RudderStack en segundo plano
  (async () => {
    try {
      const esStaging = process.env.SITE_URL?.includes("sslip.io") || process.env.SITE_URL?.includes("192.168.100.253");
      const rudderUrl = esStaging 
        ? "http://192.168.100.253:51700/v1/identify" 
        : "http://192.168.100.253:52700/v1/identify";
        
      const basicAuth = Buffer.from("crm_source:").toString("base64");
      
      await fetch(rudderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${basicAuth}`
        },
        body: JSON.stringify({
          userId: id,
          type: "identify",
          traits: {
            firstname: datos.nombre || "",
            lastname: [datos.primerApellido, datos.segundoApellido].filter(Boolean).join(" "),
            email: datos.correo || "",
            phone: datos.telefono || "",
            origen: datos.origen || ""
          },
          context: {
            library: {
              name: "http",
              version: "1.0.0"
            }
          }
        })
      });
    } catch (rudderErr) {
      console.error("[RudderStack] Error al enviar evento identify:", rudderErr);
    }
  })();

  return aProspecto(data as FilaProspecto);
}

/** Actualiza un prospecto. */
export async function actualizarProspecto(
  id: string,
  datos: DatosProspecto,
): Promise<Prospecto> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  // Obtener estado anterior
  const { data: antes } = await sb
    .from("prospectos")
    .select("asesor_id, operador_id")
    .eq("id", id)
    .maybeSingle();

  if (rol === "asesor" || rol === "operaciones") {
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if (antes?.[colId] !== usuario.id) {
      throw new Error("No estás autorizado para modificar este prospecto.");
    }
  }

  if (datos.operadorId && datos.operadorId !== antes?.operador_id) {
    const { validarAgendaOperador } = await import("@/app/actions/agenda");
    const agendaValida = await validarAgendaOperador(datos.operadorId);
    if (!agendaValida) {
      throw new Error(
        "El operario seleccionado no tiene horarios disponibles configurados o libres en los próximos 14 días.",
      );
    }
  }

  const { data, error } = await sb
    .from("prospectos")
    .update(aFilaProspecto(datos))
    .eq("id", id)
    .select("*, asesor:asesor_id(nombre), operador:operador_id(nombre)")
    .single();
  if (error) throw new Error(error.message);

  await sb
    .from("expedientes")
    .update({
      cliente: datos.nombre,
      primer_apellido: datos.primerApellido,
      segundo_apellido: datos.segundoApellido,
      telefono: datos.telefono,
      direccion_propiedad: datos.direccion || "",
      ad_name: datos.adName,
      adset_name: datos.adsetName,
      campaign_name: datos.campaignName,
      asesor_id: datos.asesorId ?? null,
      operador_id: datos.operadorId ?? null,
    })
    .eq("prospecto_id", id);

  // Enviar evento identify a RudderStack en segundo plano
  (async () => {
    try {
      // Obtener el tipo de negocio del expediente enlazado (si existe)
      const { data: exp } = await sb
        .from("expedientes")
        .select("tipo_negocio")
        .eq("prospecto_id", id)
        .maybeSingle();

      const esStaging = process.env.SITE_URL?.includes("sslip.io") || process.env.SITE_URL?.includes("192.168.100.253");
      const rudderUrl = esStaging 
        ? "http://192.168.100.253:51700/v1/identify" 
        : "http://192.168.100.253:52700/v1/identify";
        
      const basicAuth = Buffer.from("crm_source:").toString("base64");
      
      await fetch(rudderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${basicAuth}`
        },
        body: JSON.stringify({
          userId: id,
          type: "identify",
          traits: {
            firstname: datos.nombre || "",
            lastname: [datos.primerApellido, datos.segundoApellido].filter(Boolean).join(" "),
            email: datos.correo || "",
            phone: datos.telefono || "",
            origen: datos.origen || "",
            tipo_negocio: exp?.tipo_negocio || "otro"
          },
          context: {
            library: {
              name: "http",
              version: "1.0.0"
            }
          }
        })
      });
    } catch (rudderErr) {
      console.error("[RudderStack] Error al enviar evento identify en actualizarProspecto:", rudderErr);
    }
  })();

  return aProspecto(data as FilaProspecto);
}

/** Elimina un prospecto (sus expedientes quedan sin prospecto). */
export async function eliminarProspecto(id: string): Promise<void> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  if (rol === "asesor" || rol === "operaciones") {
    const { data: antes } = await sb
      .from("prospectos")
      .select("asesor_id, operador_id")
      .eq("id", id)
      .maybeSingle();
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if (antes?.[colId] !== usuario.id) {
      throw new Error("No estás autorizado para eliminar este prospecto.");
    }
  }

  const { error } = await sb.from("prospectos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Elimina varios prospectos a la vez (acción masiva). */
export async function eliminarProspectosMasivo(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const sb = supabaseServidor();
  const { error } = await sb.from("prospectos").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/** Cambia el origen de varios prospectos a la vez (acción masiva). */
export async function cambiarOrigenMasivo(
  ids: string[],
  origen: OrigenAdquisicion,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const sb = supabaseServidor();
  const { error } = await sb
    .from("prospectos")
    .update({ origen })
    .in("id", ids);
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

/** Marca o desmarca un prospecto como No Viable. */
export async function marcarProspectoNoViable(id: string, noViable: boolean): Promise<void> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  if (rol === "asesor" || rol === "operaciones") {
    const { data: antes } = await sb
      .from("prospectos")
      .select("asesor_id, operador_id")
      .eq("id", id)
      .maybeSingle();
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if (antes?.[colId] !== usuario.id) {
      throw new Error("No estás autorizado para modificar este prospecto.");
    }
  }

  const { error } = await sb
    .from("prospectos")
    .update({ no_viable: noViable })
    .eq("id", id);
  if (error) throw new Error(error.message);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/prospectos/${id}`);
}

/** Cambia el estatus de varios prospectos a la vez (acción masiva). */
export async function cambiarEstatusMasivo(
  ids: string[],
  estatus: EstatusProspecto,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const sb = supabaseServidor();
  const { error } = await sb
    .from("prospectos")
    .update({ estatus })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

/** Cambia la calificación de varios prospectos a la vez (acción masiva). */
export async function cambiarCalificacionMasivo(
  ids: string[],
  calificacion: CalificacionProspecto,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const sb = supabaseServidor();
  const { error } = await sb
    .from("prospectos")
    .update({ calificacion })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

/** Asigna un asesor a varios prospectos a la vez (acción masiva). */
export async function asignarAsesorMasivo(
  ids: string[],
  asesorId: string | null,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const sb = supabaseServidor();

  // 1. Actualizar el asesor de los prospectos
  const { error: errPros } = await sb
    .from("prospectos")
    .update({ asesor_id: asesorId })
    .in("id", ids);
  if (errPros) throw new Error(errPros.message);

  // 2. Sincronizar con los expedientes enlazados
  const { error: errExp } = await sb
    .from("expedientes")
    .update({
      asesor_id: asesorId,
      ultimo_movimiento: new Date().toISOString().slice(0, 10),
    })
    .in("prospecto_id", ids);
  if (errExp) throw new Error(errExp.message);

  // 3. Notificar a los asesores
  if (asesorId) {
    const { notificarAsignacionAsesor } = await import("@/lib/notificaciones-sistema");
    const { data: exps } = await sb
      .from("expedientes")
      .select("id")
      .in("prospecto_id", ids);
    if (exps) {
      for (const e of exps) {
        void notificarAsignacionAsesor(e.id, asesorId);
      }
    }
  }
}

/** Asigna un operador a varios prospectos a la vez (acción masiva). */
export async function asignarOperadorMasivo(
  ids: string[],
  operadorId: string | null,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  if (operadorId) {
    const { validarAgendaOperador } = await import("@/app/actions/agenda");
    const agendaValida = await validarAgendaOperador(operadorId);
    if (!agendaValida) {
      throw new Error(
        "El operario seleccionado no tiene horarios disponibles configurados o libres en los próximos 14 días.",
      );
    }
  }

  const sb = supabaseServidor();

  // 1. Actualizar prospectos
  const { error: errPros } = await sb
    .from("prospectos")
    .update({ operador_id: operadorId })
    .in("id", ids);
  if (errPros) throw new Error(errPros.message);

  // 2. Actualizar expedientes
  const { error: errExp } = await sb
    .from("expedientes")
    .update({
      operador_id: operadorId,
      ultimo_movimiento: new Date().toISOString().slice(0, 10),
    })
    .in("prospecto_id", ids);
  if (errExp) throw new Error(errExp.message);

  // 3. Notificar a los clientes
  if (operadorId) {
    const { notificarAsignacionOperarioACliente } = await import("@/lib/notificaciones-sistema");
    const { data: exps } = await sb
      .from("expedientes")
      .select("id, prospecto_id")
      .in("prospecto_id", ids);
    if (exps) {
      for (const e of exps) {
        void notificarAsignacionOperarioACliente(sb, e.id, e.prospecto_id, operadorId);
      }
    }
  }
}

