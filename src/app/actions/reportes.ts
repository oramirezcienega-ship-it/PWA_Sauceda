"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { ETAPAS } from "@/lib/etapas";
import { ORIGENES } from "@/lib/origenes";
import type { EtapaId } from "@/lib/types";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";

/** Resumen general de la operación para el dashboard. */
export interface ResumenOperacion {
  totalLeads: number;
  totalExpedientes: number;
  cerrados: number;
  perdidos: number;
  activos: number;
  tasaConversion: number;
  inversionCampanas: number;
  costoPorLead: number;
  valorPipeline: number;
  porEtapa: { etapa: EtapaId; nombre: string; total: number }[];
  porOrigen: { origen: string; nombre: string; total: number }[];
}

export async function resumenOperacion(): Promise<ResumenOperacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: exps, error: e1 } = await sb
    .from("expedientes")
    .select("etapa, valor_estimado");
  if (e1) throw new Error(e1.message);
  const { data: prosp, error: e2 } = await sb
    .from("prospectos")
    .select("origen, valor_campana");
  if (e2) throw new Error(e2.message);

  const expedientes = (exps ?? []) as {
    etapa: EtapaId;
    valor_estimado: number;
  }[];
  const prospectos = (prosp ?? []) as {
    origen: string;
    valor_campana: number;
  }[];

  const totalExpedientes = expedientes.length;
  const cerrados = expedientes.filter((e) => e.etapa === "cerrado").length;
  const perdidos = expedientes.filter((e) => e.etapa === "perdido").length;
  const activos = totalExpedientes - cerrados - perdidos;
  const tasaConversion = totalExpedientes
    ? Math.round((cerrados / totalExpedientes) * 100)
    : 0;

  const totalLeads = prospectos.length;
  const inversionCampanas = prospectos.reduce(
    (s, p) => s + Number(p.valor_campana || 0),
    0,
  );
  const costoPorLead = totalLeads
    ? Math.round(inversionCampanas / totalLeads)
    : 0;
  const valorPipeline = expedientes
    .filter((e) => e.etapa !== "cerrado" && e.etapa !== "perdido")
    .reduce((s, e) => s + Number(e.valor_estimado || 0), 0);

  const porEtapa = ETAPAS.map((et) => ({
    etapa: et.id,
    nombre: et.nombre,
    total: expedientes.filter((e) => e.etapa === et.id).length,
  }));

  const porOrigen = ORIGENES.map((o) => ({
    origen: o.id,
    nombre: o.nombre,
    total: prospectos.filter((p) => p.origen === o.id).length,
  }))
    .filter((o) => o.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    totalLeads,
    totalExpedientes,
    cerrados,
    perdidos,
    activos,
    tasaConversion,
    inversionCampanas,
    costoPorLead,
    valorPipeline,
    porEtapa,
    porOrigen,
  };
}

export interface ResumenAsesor {
  totalLeads: number;
  totalTareas: number;
  tareasPendientes: number;
  tareasCompletadas: number;
  cerrados: number;
  tasaConversion: number;
  leadsAsignados: {
    id: string;
    nombre: string;
    telefono: string;
    estatus: string;
    calificacion: string;
    fechaAsignacion: string;
  }[];
  tareasPendientesLista: {
    id: string;
    tipo: string;
    agendadaPara: string;
    contexto: string;
    leadNombre: string;
    leadTelefono: string;
  }[];
}

/** Obtiene el resumen de KPIs, tareas y leads para el asesor actual. */
export async function resumenAsesor(): Promise<ResumenAsesor> {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const sb = supabaseServidor();

  // 1. Obtener todas las tareas del asesor
  const { data: tasks, error: eTasks } = await sb
    .from("asesor_tasks")
    .select(`
      id,
      tipo,
      status,
      agendada_para,
      enrollment:sequence_enrollments(
        id,
        prospecto_id,
        expediente_id,
        nombre,
        phone
      )
    `)
    .eq("asesor_id", usuario.id);

  if (eTasks) throw new Error(eTasks.message);

  const totalTareas = tasks?.length ?? 0;
  const tareasPendientes = tasks?.filter((t) => t.status === "pendiente").length ?? 0;
  const tareasCompletadas = tasks?.filter((t) => t.status === "completada").length ?? 0;

  // 2. Obtener el nombre del asesor para buscar conversaciones de WhatsApp asignadas
  const userProfile = await obtenerUsuarioActual();
  const nombreAgente = userProfile?.nombre || "";

  // 3. Extraer los prospectos / expedientes únicos asignados a través de las tareas
  const prospectosMap = new Map<string, { id: string; nombre: string; telefono: string; fechaAsignacion: string }>();
  const expedienteIds = new Set<string>();

  tasks?.forEach((t) => {
    const enr = t.enrollment as any;
    if (enr) {
      if (enr.prospecto_id) {
        prospectosMap.set(enr.prospecto_id, {
          id: enr.prospecto_id,
          nombre: enr.nombre || "Sin nombre",
          telefono: enr.phone || "",
          fechaAsignacion: t.agendada_para
        });
      }
      if (enr.expediente_id) {
        expedienteIds.add(enr.expediente_id);
      }
    }
  });

  // 4. Buscar también leads por interacción en WhatsApp
  let extraProspectoIds: string[] = [];
  if (nombreAgente) {
    const { data: recentMsgs } = await sb
      .from("mensajes_whatsapp")
      .select("prospecto_id")
      .eq("agente", nombreAgente)
      .not("prospecto_id", "is", null);
    if (recentMsgs) {
      extraProspectoIds = recentMsgs.map((m) => m.prospecto_id).filter(Boolean) as string[];
    }
  }

  // 4b. Agregar prospectos asignados directamente por la columna de asesor_id
  const { data: directProspectos } = await sb
    .from("prospectos")
    .select("id, nombre, primer_apellido, segundo_apellido, telefono, created_at")
    .eq("asesor_id", usuario.id);
  
  if (directProspectos) {
    directProspectos.forEach((p) => {
      if (!prospectosMap.has(p.id)) {
        const nombreCompleto = [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" ");
        prospectosMap.set(p.id, {
          id: p.id,
          nombre: nombreCompleto || "Sin nombre",
          telefono: p.telefono || "",
          fechaAsignacion: p.created_at || new Date().toISOString()
        });
      }
    });
  }

  // 4c. Agregar expedientes asignados directamente por la columna de asesor_id
  const { data: directExpedientes } = await sb
    .from("expedientes")
    .select("id, prospecto_id")
    .eq("asesor_id", usuario.id);

  const directProspectoIdsFromExp: string[] = [];
  if (directExpedientes) {
    directExpedientes.forEach((e) => {
      expedienteIds.add(e.id);
      if (e.prospecto_id) {
        directProspectoIdsFromExp.push(e.prospecto_id);
      }
    });
  }

  const prospectoIds = Array.from(
    new Set([
      ...Array.from(prospectosMap.keys()),
      ...extraProspectoIds,
      ...directProspectoIdsFromExp,
    ])
  );

  // 5. Consultar la información real de los prospectos (estatus y calificación)
  let leadsAsignados: ResumenAsesor["leadsAsignados"] = [];
  if (prospectoIds.length > 0) {
    const { data: propsData, error: eProps } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido, telefono, estatus, calificacion, created_at")
      .in("id", prospectoIds);

    if (!eProps && propsData) {
      leadsAsignados = propsData.map((p) => {
        const mappedName = [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" ");
        const originalInfo = prospectosMap.get(p.id);
        return {
          id: p.id,
          nombre: mappedName || originalInfo?.nombre || "Sin nombre",
          telefono: p.telefono || originalInfo?.telefono || "",
          estatus: p.estatus || "nuevo",
          calificacion: p.calificacion || "frio",
          fechaAsignacion: originalInfo?.fechaAsignacion || p.created_at || new Date().toISOString()
        };
      });
    }
  }

  // 6. Consultar los expedientes asociados a las tareas para ver cuántos están cerrados (conversión)
  let cerrados = 0;
  const expIdsArray = Array.from(expedienteIds);
  if (expIdsArray.length > 0) {
    const { data: expsData, error: eExps } = await sb
      .from("expedientes")
      .select("id, etapa")
      .in("id", expIdsArray);

    if (!eExps && expsData) {
      cerrados = expsData.filter((e) => e.etapa === "cerrado").length;
    }
  }

  const totalLeads = leadsAsignados.length;
  const tasaConversion = totalLeads ? Math.round((cerrados / totalLeads) * 100) : 0;

  // 7. Filtrar las tareas pendientes con contexto y detalles de contacto para mostrarlas en una lista
  const tareasPendientesListaRaw = tasks?.filter((t) => t.status === "pendiente") || [];
  
  // Para las tareas pendientes, obtener detalles de expediente si aplica
  const pendExpIds = tareasPendientesListaRaw
    .map((t) => (t.enrollment as any)?.expediente_id)
    .filter(Boolean) as string[];

  let pendExpMap = new Map<string, any>();
  if (pendExpIds.length > 0) {
    const { data: pExps } = await sb
      .from("expedientes")
      .select("id, cliente, notas, situacion, fraccionamiento")
      .in("id", pendExpIds);
    pendExpMap = new Map((pExps || []).map((e) => [e.id, e]));
  }

  const tareasPendientesLista = tareasPendientesListaRaw.map((t) => {
    const enr = t.enrollment as any;
    const exp = enr?.expediente_id ? pendExpMap.get(enr.expediente_id) : null;
    const contexto = exp
      ? `Fraccionamiento: ${exp.fraccionamiento || ""}. Situación: ${exp.situacion || ""}. Notas: ${exp.notas || ""}`
      : "Lead sin expediente enlazado.";

    return {
      id: t.id,
      tipo: t.tipo || "seguimiento",
      agendadaPara: t.agendada_para,
      contexto,
      leadNombre: enr?.nombre || "Sin nombre",
      leadTelefono: enr?.phone || ""
    };
  });

  return {
    totalLeads,
    totalTareas,
    tareasPendientes,
    tareasCompletadas,
    cerrados,
    tasaConversion,
    leadsAsignados,
    tareasPendientesLista
  };
}
