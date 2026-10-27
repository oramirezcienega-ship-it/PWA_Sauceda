"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { revalidatePath } from "next/cache";

export interface CitaRutaEnriquecida {
  id: string;
  expediente_id: string | null;
  prospecto_id: string | null;
  cliente_nombre: string;
  cliente_telefono: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: "pendiente" | "confirmada" | "completada" | "cancelada" | "reagendada";
  notas: string | null;
  servicio_tipo: string;
  fraccionamiento: string | null;
  direccion_completa: string;
  link_google_maps: string | null;
  tecnico_asignado: string;
  tecnico_id: string | null;
  valor_estimado?: number | null;
}

export interface FiltrosRutaSemanal {
  proveedor?: string;
  tipoNegocio?: string;
  estado?: string;
}

export interface RespuestaRutaSemanal {
  citas: CitaRutaEnriquecida[];
  proveedores: { id: string; nombre: string }[];
  tiposNegocio: { id: string; label: string }[];
  resumen: {
    total: number;
    confirmadas: number;
    pendientes: number;
  };
}

const NOMBRES_NEGOCIOS: Record<string, string> = {
  "construccion-piso-estampado": "Concreto Estampado",
  "construccion-impermeabilizacion": "Impermeabilización",
  "construccion-mantenimiento-calentadores": "Calentadores Solares / Plomería",
  "seguridad": "Seguridad y CCTV",
  "construccion": "Obra y Construcción",
};

export async function obtenerRutaSemanalInspecciones(
  fechaInicio: string,
  fechaFin: string
): Promise<RespuestaRutaSemanal> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener citas del rango
  const { data: citasRaw, error: errCitas } = await sb
    .from("agenda_citas")
    .select("*")
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin)
    .neq("estado", "cancelada")
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (errCitas) {
    console.error("Error al obtener citas para ruta:", errCitas);
    throw new Error("No se pudieron cargar las citas de la ruta.");
  }

  const citas = citasRaw || [];

  // 2. Extraer IDs para enriquecimiento
  const expIds = Array.from(new Set(citas.map((c) => c.expediente_id).filter(Boolean))) as string[];
  const perfilIds = Array.from(new Set(citas.map((c) => c.perfil_id).filter(Boolean))) as string[];

  // 3. Consultar expedientes
  let mapaExpedientes: Record<string, any> = {};
  if (expIds.length > 0) {
    const { data: exps } = await sb
      .from("expedientes")
      .select("id, direccion_propiedad, link_google_maps, tipo_negocio, valor_estimado, necesidad")
      .in("id", expIds);
    if (exps) {
      mapaExpedientes = Object.fromEntries(exps.map((e) => [e.id, e]));
    }
  }

  // 4. Consultar perfiles
  let mapaPerfiles: Record<string, any> = {};
  if (perfilIds.length > 0) {
    const { data: perfs } = await sb
      .from("perfiles")
      .select("id, nombre, telefono")
      .in("id", perfilIds);
    if (perfs) {
      mapaPerfiles = Object.fromEntries(perfs.map((p) => [p.id, p]));
    }
  }

  // 5. Enriquecer cada cita
  const citasEnriquecidas: CitaRutaEnriquecida[] = citas.map((c) => {
    const exp = c.expediente_id ? mapaExpedientes[c.expediente_id] : null;
    const perf = c.perfil_id ? mapaPerfiles[c.perfil_id] : null;

    let tecnicoNombre = perf?.nombre || "Sin Asignar";
    // Si en notas o tipo se detecta Clemente Plomero
    if (c.notas?.toLowerCase().includes("clemente") || c.servicio_tipo === "construccion-mantenimiento-calentadores") {
      tecnicoNombre = "Clemente Plomero";
    } else if (tecnicoNombre.toLowerCase().includes("cordova")) {
      tecnicoNombre = "Alejandro Córdova";
    }

    const negocioClave = c.servicio_tipo || exp?.tipo_negocio || "construccion-piso-estampado";

    const direccionCompleta =
      exp?.direccion_propiedad ||
      c.direccion ||
      (c.fraccionamiento ? `Fracc. ${c.fraccionamiento}` : "Dirección por definir");

    return {
      id: c.id,
      expediente_id: c.expediente_id,
      prospecto_id: c.prospecto_id,
      cliente_nombre: c.cliente_nombre || "Cliente sin nombre",
      cliente_telefono: c.cliente_telefono || exp?.telefono || "",
      fecha: c.fecha,
      hora_inicio: (c.hora_inicio || "09:00").slice(0, 5),
      hora_fin: (c.hora_fin || "10:00").slice(0, 5),
      estado: c.estado || "confirmada",
      notas: c.notas || null,
      servicio_tipo: negocioClave,
      fraccionamiento: c.fraccionamiento || null,
      direccion_completa: direccionCompleta,
      link_google_maps: exp?.link_google_maps || null,
      tecnico_asignado: tecnicoNombre,
      tecnico_id: c.perfil_id || null,
      valor_estimado: exp?.valor_estimado || null,
    };
  });

  // 6. Proveedores únicos
  const tecnicosSet = new Set<string>();
  const proveedoresList: { id: string; nombre: string }[] = [];
  citasEnriquecidas.forEach((c) => {
    if (!tecnicosSet.has(c.tecnico_asignado)) {
      tecnicosSet.add(c.tecnico_asignado);
      proveedoresList.push({ id: c.tecnico_asignado, nombre: c.tecnico_asignado });
    }
  });

  // 7. Tipos de negocio únicos
  const negociosSet = new Set<string>();
  const tiposNegocioList: { id: string; label: string }[] = [];
  citasEnriquecidas.forEach((c) => {
    if (!negociosSet.has(c.servicio_tipo)) {
      negociosSet.add(c.servicio_tipo);
      tiposNegocioList.push({
        id: c.servicio_tipo,
        label: NOMBRES_NEGOCIOS[c.servicio_tipo] || c.servicio_tipo,
      });
    }
  });

  // 8. Resumen
  const confirmadas = citasEnriquecidas.filter((c) => c.estado === "confirmada").length;
  const pendientes = citasEnriquecidas.filter((c) => c.estado === "pendiente" || c.estado === "reagendada").length;

  return {
    citas: citasEnriquecidas,
    proveedores: proveedoresList,
    tiposNegocio: tiposNegocioList,
    resumen: {
      total: citasEnriquecidas.length,
      confirmadas,
      pendientes,
    },
  };
}

export async function reprogramarCitaSemanal(
  citaId: string,
  nuevaFecha: string,
  nuevaHoraInicio: string,
  nuevaHoraFin?: string
) {
  await requireAdmin();
  const sb = supabaseServidor();

  // Calcular hora fin por defecto (+1 hora)
  let hFin = nuevaHoraFin;
  if (!hFin) {
    const [h, m] = nuevaHoraInicio.split(":").map(Number);
    const finH = String((h + 1) % 24).padStart(2, "0");
    hFin = `${finH}:${String(m).padStart(2, "0")}:00`;
  }

  const { error } = await sb
    .from("agenda_citas")
    .update({
      fecha: nuevaFecha,
      hora_inicio: nuevaHoraInicio.length === 5 ? `${nuevaHoraInicio}:00` : nuevaHoraInicio,
      hora_fin: hFin.length === 5 ? `${hFin}:00` : hFin,
    })
    .eq("id", citaId);

  if (error) {
    console.error("Error al reprogramar cita:", error);
    throw new Error("No se pudo reprogramar la cita.");
  }

  revalidatePath("/agenda");
  return { ok: true };
}

export async function actualizarEstadoCitaSemanal(
  citaId: string,
  nuevoEstado: "confirmada" | "pendiente" | "completada" | "cancelada"
) {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("agenda_citas")
    .update({ estado: nuevoEstado })
    .eq("id", citaId);

  if (error) {
    console.error("Error al actualizar estado de cita:", error);
    throw new Error("No se pudo actualizar el estado de la cita.");
  }

  revalidatePath("/agenda");
  return { ok: true };
}
