"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import { ETAPAS } from "@/lib/etapas";
import { ORIGENES } from "@/lib/origenes";
import { type EtapaId, labelTipoNegocio } from "@/lib/types";
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
  porTipoNegocio: { tipoNegocio: string; nombre: string; total: number }[];
}

export async function resumenOperacion(
  fechaInicio?: string,
  fechaFin?: string
): Promise<ResumenOperacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  let queryExps = sb
    .from("expedientes")
    .select("etapa, valor_estimado, created_at, tipo_negocio");
  if (fechaInicio) {
    queryExps = queryExps.gte("created_at", fechaInicio);
  }
  if (fechaFin) {
    queryExps = queryExps.lte("created_at", fechaFin);
  }
  const { data: exps, error: e1 } = await queryExps;
  if (e1) throw new Error(e1.message);

  let queryProsp = sb
    .from("prospectos")
    .select("origen, valor_campana, created_at");
  if (fechaInicio) {
    queryProsp = queryProsp.gte("created_at", fechaInicio);
  }
  if (fechaFin) {
    queryProsp = queryProsp.lte("created_at", fechaFin);
  }
  const { data: prosp, error: e2 } = await queryProsp;
  if (e2) throw new Error(e2.message);

  const expedientes = (exps ?? []) as {
    etapa: EtapaId;
    valor_estimado: number;
    created_at: string;
    tipo_negocio?: string | null;
  }[];
  const prospectos = (prosp ?? []) as {
    origen: string;
    valor_campana: number;
    created_at: string;
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

  // Agrupamiento por tipo de negocio
  const todosTipos = Array.from(
    new Set(expedientes.map((e) => e.tipo_negocio || "otro"))
  );
  const porTipoNegocio = todosTipos
    .map((t) => ({
      tipoNegocio: t,
      nombre: labelTipoNegocio(t),
      total: expedientes.filter((e) => (e.tipo_negocio || "otro") === t).length,
    }))
    .filter((t) => t.total > 0)
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
    porTipoNegocio,
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
    fechaCreacion?: string | null;
    ventanaAbierta?: boolean;
    expedienteId?: string;
    fraccionamiento?: string;
    etapaExpediente?: string;
    notasExpediente?: string;
    tipoNegocio?: string | null;
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

/** Obtiene el resumen de KPIs, tareas y leads para el asesor/operador actual. */
export async function resumenAsesor(
  fechaInicio?: string,
  fechaFin?: string
): Promise<ResumenAsesor> {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const colId = rol === "asesor" ? ("asesor_id" as const) : ("operador_id" as const);
  const sb = supabaseServidor();

  // 1. Obtener todas las tareas del asesor (secuencias de marketing)
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

  // 1b. Obtener todas las tareas de BPM asignadas al usuario actual o a los expedientes donde es responsable
  const { data: userExps } = await sb
    .from("expedientes")
    .select("id")
    .or(`asesor_id.eq.${usuario.id},operador_id.eq.${usuario.id}`);

  const myExpIds = (userExps || []).map((e) => e.id);

  let bpmQuery = sb
    .from("bpm_expediente_tareas")
    .select(`
      id,
      titulo,
      descripcion,
      estado,
      agendada_para,
      expediente_id,
      responsable_id,
      expediente:expediente_id(
        id,
        cliente,
        primer_apellido,
        segundo_apellido,
        telefono,
        fraccionamiento,
        situacion,
        notas
      )
    `);

  if (myExpIds.length > 0) {
    bpmQuery = bpmQuery.or(`responsable_id.eq.${usuario.id},expediente_id.in.(${myExpIds.join(",")})`);
  } else {
    bpmQuery = bpmQuery.eq("responsable_id", usuario.id);
  }

  const { data: bpmTasks, error: eBpmTasks } = await bpmQuery;

  if (eBpmTasks) throw new Error(eBpmTasks.message);

  const totalBpmTareas = bpmTasks?.length ?? 0;
  const bpmTareasPendientes = bpmTasks?.filter((t) => t.estado === "pendiente").length ?? 0;
  const bpmTareasCompletadas = bpmTasks?.filter((t) => t.estado === "completada").length ?? 0;

  const totalTareas = (tasks?.length ?? 0) + totalBpmTareas;
  const tareasPendientes = (tasks?.filter((t) => t.status === "pendiente").length ?? 0) + bpmTareasPendientes;
  const tareasCompletadas = (tasks?.filter((t) => t.status === "completada").length ?? 0) + bpmTareasCompletadas;

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

  bpmTasks?.forEach((t) => {
    const exp = Array.isArray(t.expediente) ? t.expediente[0] : (t.expediente as any);
    if (exp?.id) {
      expedienteIds.add(exp.id);
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

  // 4b. Agregar prospectos asignados directamente por la columna de asesor_id/operador_id
  let queryDirectProps = sb
    .from("prospectos")
    .select("id, nombre, primer_apellido, segundo_apellido, telefono, created_at")
    .eq(colId, usuario.id);
  if (fechaInicio) {
    queryDirectProps = queryDirectProps.gte("created_at", fechaInicio);
  }
  if (fechaFin) {
    queryDirectProps = queryDirectProps.lte("created_at", fechaFin);
  }
  const { data: directProspectos } = await queryDirectProps;
  
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

  // 4c. Agregar expedientes asignados directamente por la columna de asesor_id/operador_id
  let queryDirectExps = sb
    .from("expedientes")
    .select("id, prospecto_id, cliente, primer_apellido, segundo_apellido, telefono, created_at, fraccionamiento, etapa, notas, tipo_negocio")
    .eq(colId, usuario.id);
  if (fechaInicio) {
    queryDirectExps = queryDirectExps.gte("created_at", fechaInicio);
  }
  if (fechaFin) {
    queryDirectExps = queryDirectExps.lte("created_at", fechaFin);
  }
  const { data: directExpedientes } = await queryDirectExps;

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

  // 4d. Obtener detalles de los expedientes asociados a estos prospectoIds
  const expsMap = new Map<string, any>();
  if (prospectoIds.length > 0) {
    const { data: expsData } = await sb
      .from("expedientes")
      .select("id, prospecto_id, fraccionamiento, etapa, notas, tipo_negocio")
      .in("prospecto_id", prospectoIds);
    if (expsData) {
      expsData.forEach((e) => {
        if (e.prospecto_id) {
          expsMap.set(e.prospecto_id, e);
        }
      });
    }
  }

  // 5. Consultar la información real de los prospectos (estatus y calificación)
  let leadsAsignados: ResumenAsesor["leadsAsignados"] = [];
  const processedProspectoIds = new Set<string>();

  if (prospectoIds.length > 0) {
    const { data: propsData, error: eProps } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido, telefono, estatus, calificacion, created_at")
      .in("id", prospectoIds);

    if (!eProps && propsData) {
      leadsAsignados = propsData.map((p) => {
        processedProspectoIds.add(p.id);
        const mappedName = [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" ");
        const originalInfo = prospectosMap.get(p.id);
        const exp = expsMap.get(p.id);
        return {
          id: p.id,
          nombre: mappedName || originalInfo?.nombre || "Sin nombre",
          telefono: p.telefono || originalInfo?.telefono || "",
          estatus: p.estatus || "nuevo",
          calificacion: p.calificacion || "frio",
          fechaAsignacion: originalInfo?.fechaAsignacion || p.created_at || new Date().toISOString(),
          fechaCreacion: p.created_at || null,
          expedienteId: exp?.id,
          fraccionamiento: exp?.fraccionamiento,
          etapaExpediente: exp?.etapa,
          notasExpediente: exp?.notas,
          tipoNegocio: exp?.tipo_negocio || null,
        };
      });
    }
  }

  // 5b. Agregar expedientes asignados que no tienen un prospecto enlazado o cuyo prospecto no existe en la BD
  if (directExpedientes) {
    directExpedientes.forEach((e) => {
      if (!e.prospecto_id || !processedProspectoIds.has(e.prospecto_id)) {
        const nombreCompleto = [e.cliente, e.primer_apellido, e.segundo_apellido].filter(Boolean).join(" ");
        leadsAsignados.push({
          id: `exp-${e.id}`, // Prefijo para no colisionar con IDs de prospecto
          nombre: nombreCompleto || "Cliente sin nombre",
          telefono: e.telefono || "",
          estatus: "expediente_abierto",
          calificacion: "caliente",
          fechaAsignacion: e.created_at || new Date().toISOString(),
          fechaCreacion: e.created_at || null,
          expedienteId: e.id,
          fraccionamiento: e.fraccionamiento,
          etapaExpediente: e.etapa,
          notasExpediente: e.notas,
          tipoNegocio: e.tipo_negocio || null,
        });
      }
    });
  }

  // 5c. Consultar la ventana de 24h para cada lead asignado
  const telefonos = leadsAsignados.map((l) => l.telefono).filter(Boolean);
  const ultimoInboundPorTel = new Map<string, string>();
  if (telefonos.length > 0) {
    const { data: msgData } = await sb
      .from("mensajes_whatsapp")
      .select("telefono, created_at")
      .eq("direccion", "in")
      .in("telefono", telefonos)
      .order("created_at", { ascending: false });

    if (msgData) {
      msgData.forEach((m) => {
        if (!ultimoInboundPorTel.has(m.telefono)) {
          ultimoInboundPorTel.set(m.telefono, m.created_at);
        }
      });
    }
  }

  // Enriquecer leadsAsignados con ventanaAbierta
  leadsAsignados = leadsAsignados.map((l) => {
    const ultimoInbound = l.telefono ? ultimoInboundPorTel.get(l.telefono) : null;
    const ventanaAbierta = ultimoInbound
      ? (Date.now() - new Date(ultimoInbound).getTime() < 24 * 60 * 60 * 1000)
      : false;
    return {
      ...l,
      ventanaAbierta,
    };
  });

  // Ordenar leads asignados por fecha de creación/asignación descendente (los más recientes primero)
  leadsAsignados.sort((a, b) => {
    const timeA = new Date(a.fechaCreacion || a.fechaAsignacion || 0).getTime();
    const timeB = new Date(b.fechaCreacion || b.fechaAsignacion || 0).getTime();
    return timeB - timeA;
  });

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

  // 7. Filtrar las tareas de secuencias pendientes con contexto y detalles de contacto para mostrarlas en una lista
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
 
  const sequenceTareasPendientes = tareasPendientesListaRaw.map((t) => {
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

  // Mapear las tareas de BPM pendientes para agregarlas a la lista del dashboard
  const bpmTareasPendientesLista = (bpmTasks?.filter((t) => t.estado === "pendiente") || []).map((t) => {
    const exp = t.expediente as any;
    const contexto = exp
      ? `BPM - Fraccionamiento: ${exp.fraccionamiento || ""}. Situación: ${exp.situacion || ""}. Notas: ${exp.notas || ""}`
      : "Tarea BPM sin expediente enlazado.";

    const leadNombre = exp
      ? [exp.cliente, exp.primer_apellido, exp.segundo_apellido].filter(Boolean).join(" ")
      : "Sin nombre";

    return {
      id: t.id,
      tipo: "BPM",
      agendadaPara: t.agendada_para,
      contexto: `${t.descripcion ? `${t.descripcion}. ` : ""}${contexto}`,
      leadNombre,
      leadTelefono: exp?.telefono || ""
    };
  });

  // Combinar ambas fuentes de tareas pendientes
  const tareasPendientesLista = [
    ...sequenceTareasPendientes,
    ...bpmTareasPendientesLista
  ];
 
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
