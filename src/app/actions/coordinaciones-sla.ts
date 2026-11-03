"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono } from "@/lib/telefono";

export type EstadoSlaItem = "en_tiempo" | "por_vencer" | "vencido" | "cumplido";
export type FaseCoordinacion =
  | "esperando_proveedor"
  | "fechas_recibidas"
  | "acordada_por_agendar"
  | "agendada";

export interface CoordinacionSlaItem {
  id: string;
  folio: string;
  tipoOrigen: "solicitud_servicio" | "coordinacion_inspeccion";
  tipoServicio: string;
  tipoNegocio: string;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string;
  zona: string;
  expedienteId: string | null;
  ordenTrabajoId: string | null;
  descripcion: string;
  
  // Proveedor
  proveedorId: string | null;
  proveedorNombre: string;
  proveedorTelefono: string;
  proveedorWhatsapp: string;

  // SLA
  horasRespuestaTotal: number;
  slaLimiteIso: string | null;
  slaMinutosRestantes: number | null;
  slaEstado: EstadoSlaItem;
  fase: FaseCoordinacion;

  // Fechas
  fechasSugeridasInicial: string;
  fechasPropuestasProveedor: string[];
  fechaAcordada: string | null;
  costoAcordado: number | null;
  
  createdAt: string;
  updatedAt: string;
}

export interface ResumenSlaCoordinaciones {
  totalActivas: number;
  enTiempo: number;
  porVencer: number;
  vencidas: number;
  fechasListasParaCliente: number;
}

export interface RespuestaCoordinacionesSla {
  items: CoordinacionSlaItem[];
  resumen: ResumenSlaCoordinaciones;
}

const NOMBRES_NEGOCIOS: Record<string, string> = {
  "construccion-piso-estampado": "Concreto Estampado",
  "construccion-impermeabilizacion": "Impermeabilización",
  "construccion-mantenimiento-calentadores": "Calentadores Solares / Plomería",
  "seguridad": "Seguridad y CCTV",
  "construccion": "Obra y Construcción",
};

export async function obtenerCoordinacionesSlaAgenda(): Promise<RespuestaCoordinacionesSla> {
  await requireAdmin();
  const sb = supabaseServidor();
  const ahora = new Date();

  // 1. Obtener solicitudes_proveedor que no estén canceladas
  const { data: solsRaw, error: errSols } = await sb
    .from("solicitudes_proveedor")
    .select(`
      id, folio, estado, descripcion, zona, fechas_sugeridas, horas_respuesta, fecha_acordada, costo_acordado, created_at, updated_at, expediente_id, orden_trabajo_id,
      solicitudes_proveedor_envios (
        id, orden, estado, fecha_limite, enviada_at, respondida_at, fechas_propuestas, comentario, proveedor_id,
        proveedores ( id, nombre, telefono, whatsapp )
      ),
      proveedores:proveedor_asignado_id ( id, nombre, telefono, whatsapp ),
      expedientes:expediente_id ( id, cliente, primer_apellido, telefono, fraccionamiento, direccion_propiedad, tipo_negocio, necesidad )
    `)
    .neq("estado", "cancelada")
    .order("created_at", { ascending: false })
    .limit(40);

  if (errSols) {
    console.error("Error al obtener solicitudes para SLA:", errSols);
  }

  // 2. Obtener coordinaciones_inspeccion recientes (últimos 30 días o activas)
  const hace30d = new Date();
  hace30d.setDate(hace30d.getDate() - 30);
  const { data: coordsRaw, error: errCoords } = await sb
    .from("coordinaciones_inspeccion")
    .select("*")
    .gte("created_at", hace30d.toISOString())
    .neq("estado", "cancelada")
    .order("created_at", { ascending: false })
    .limit(30);

  if (errCoords) {
    console.error("Error al obtener coordinaciones_inspeccion:", errCoords);
  }

  const items: CoordinacionSlaItem[] = [];

  // Mapear Solicitudes de Proveedor
  (solsRaw || []).forEach((s: any) => {
    const exp = s.expedientes;
    const envios = s.solicitudes_proveedor_envios || [];
    // Encontrar el envío activo más relevante
    const envioActivo = envios.find((e: any) => e.estado === "enviada" || e.estado === "vista") || envios[0] || null;
    const provDirecto = s.proveedores || (envioActivo ? envioActivo.proveedores : null);

    const fechaLimite = envioActivo?.fecha_limite || null;
    let minutosRestantes: number | null = null;
    let estadoSla: EstadoSlaItem = "en_tiempo";

    if (fechaLimite) {
      const limiteDate = new Date(fechaLimite);
      const diffMs = limiteDate.getTime() - ahora.getTime();
      minutosRestantes = Math.round(diffMs / (1000 * 60));

      if (minutosRestantes < 0) {
        estadoSla = "vencido";
      } else if (minutosRestantes <= 120) {
        // Menos de 2 horas para vencer
        estadoSla = "por_vencer";
      } else {
        estadoSla = "en_tiempo";
      }
    }

    // Determinar fase
    let fase: FaseCoordinacion = "esperando_proveedor";
    const fechasPropuestas = envioActivo?.fechas_propuestas || [];

    if (s.estado === "confirmada" && s.fecha_acordada) {
      fase = "acordada_por_agendar";
    } else if (fechasPropuestas.length > 0 || envioActivo?.estado === "aceptada") {
      fase = "fechas_recibidas";
      estadoSla = "cumplido";
    } else if (s.estado === "abierta") {
      fase = "esperando_proveedor";
    }

    const clienteNom = [exp?.cliente, exp?.primer_apellido].filter(Boolean).join(" ") || "Cliente";

    items.push({
      id: s.id,
      folio: s.folio || `SOL-${s.id.slice(0, 6)}`,
      tipoOrigen: "solicitud_servicio",
      tipoServicio: s.descripcion?.split(":")[0]?.trim() || "Servicio / Instalación",
      tipoNegocio: NOMBRES_NEGOCIOS[exp?.tipo_negocio || ""] || exp?.tipo_negocio || "Servicios",
      clienteNombre: clienteNom,
      clienteTelefono: exp?.telefono || "",
      direccion: exp?.direccion_propiedad || "",
      zona: s.zona || exp?.fraccionamiento || "León",
      expedienteId: s.expediente_id,
      ordenTrabajoId: s.orden_trabajo_id,
      descripcion: s.descripcion || "",
      proveedorId: provDirecto?.id || null,
      proveedorNombre: provDirecto?.nombre || "Sin proveedor asignado",
      proveedorTelefono: provDirecto?.telefono || "",
      proveedorWhatsapp: provDirecto?.whatsapp || provDirecto?.telefono || "",
      horasRespuestaTotal: s.horas_respuesta || 24,
      slaLimiteIso: fechaLimite,
      slaMinutosRestantes: minutosRestantes,
      slaEstado: estadoSla,
      fase,
      fechasSugeridasInicial: s.fechas_sugeridas || "",
      fechasPropuestasProveedor: Array.isArray(fechasPropuestas) ? fechasPropuestas : [],
      fechaAcordada: s.fecha_acordada,
      costoAcordado: s.costo_acordado,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    });
  });

  // Mapear Coordinaciones de Inspección
  (coordsRaw || []).forEach((c: any) => {
    // Si ya existe como cita confirmada o cancelada no prioritaria
    const fechaLimite = c.sla_limite_at || null;
    let minutosRestantes: number | null = null;
    let estadoSla: EstadoSlaItem = "en_tiempo";

    if (fechaLimite) {
      const limiteDate = new Date(fechaLimite);
      const diffMs = limiteDate.getTime() - ahora.getTime();
      minutosRestantes = Math.round(diffMs / (1000 * 60));

      if (minutosRestantes < 0) {
        estadoSla = "vencido";
      } else if (minutosRestantes <= 60) {
        estadoSla = "por_vencer";
      } else {
        estadoSla = "en_tiempo";
      }
    }

    let fase: FaseCoordinacion = "esperando_proveedor";
    if (c.estado === "confirmada") {
      fase = "agendada";
      estadoSla = "cumplido";
    } else if (c.opciones_validadas?.length > 0) {
      fase = "fechas_recibidas";
    }

    items.push({
      id: c.id,
      folio: `INSP-${c.id.slice(0, 6)}`,
      tipoOrigen: "coordinacion_inspeccion",
      tipoServicio: "Inspección Técnica / Medición",
      tipoNegocio: c.servicio_nombre || "Construcción",
      clienteNombre: c.cliente_nombre || "Cliente",
      clienteTelefono: c.cliente_telefono || "",
      direccion: c.ubicacion || "",
      zona: c.fraccionamiento || c.ubicacion || "León",
      expedienteId: c.expediente_id,
      ordenTrabajoId: null,
      descripcion: c.detalles_tecnicos || "Inspección técnica para cotización",
      proveedorId: null,
      proveedorNombre: "Asesor Técnico",
      proveedorTelefono: "",
      proveedorWhatsapp: "",
      horasRespuestaTotal: (c.sla_minutos || 60) / 60,
      slaLimiteIso: fechaLimite,
      slaMinutosRestantes: minutosRestantes,
      slaEstado: estadoSla,
      fase,
      fechasSugeridasInicial: "",
      fechasPropuestasProveedor: (c.opciones_horarios || []).map((o: any) => o.label || `${o.fecha} ${o.horaInicio}`),
      fechaAcordada: null,
      costoAcordado: null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  });

  // Ordenar: primero los vencidos y por vencer, luego los que tienen fechas recibidas listos para cliente
  items.sort((a, b) => {
    const pesoEstado: Record<EstadoSlaItem, number> = {
      vencido: 0,
      por_vencer: 1,
      en_tiempo: 2,
      cumplido: 3,
    };
    if (pesoEstado[a.slaEstado] !== pesoEstado[b.slaEstado]) {
      return pesoEstado[a.slaEstado] - pesoEstado[b.slaEstado];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Calcular métricas del resumen
  const resumen: ResumenSlaCoordinaciones = {
    totalActivas: items.filter((i) => i.fase !== "agendada").length,
    vencidas: items.filter((i) => i.slaEstado === "vencido" && i.fase !== "agendada").length,
    porVencer: items.filter((i) => i.slaEstado === "por_vencer" && i.fase !== "agendada").length,
    enTiempo: items.filter((i) => i.slaEstado === "en_tiempo" && i.fase !== "agendada").length,
    fechasListasParaCliente: items.filter((i) => i.fase === "fechas_recibidas" || i.fase === "acordada_por_agendar").length,
  };

  return { items, resumen };
}

/**
 * Agendar directamente una cita fija en la agenda a partir de una coordinación
 */
export async function agendarCitaDesdeCoordinacion(input: {
  solicitudId?: string;
  expedienteId?: string | null;
  prospectoId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  servicioTipo: string;
  fraccionamiento?: string;
  notas?: string;
}): Promise<{ ok: boolean; citaId?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const yo = await usuarioActual();

    // 1. Insertar en agenda_citas
    const { data: cita, error: errCita } = await sb
      .from("agenda_citas")
      .insert({
        perfil_id: yo?.id || null,
        expediente_id: input.expedienteId || null,
        prospecto_id: input.prospectoId || null,
        cliente_nombre: input.clienteNombre,
        cliente_telefono: normalizarTelefono(input.clienteTelefono),
        tipo_cita: "inspeccion",
        fecha: input.fecha,
        hora_inicio: input.horaInicio,
        hora_fin: input.horaFin,
        estado: "confirmada",
        servicio_tipo: input.servicioTipo,
        fraccionamiento: input.fraccionamiento || null,
        notas: input.notas || "Agendada desde Coordinaciones & SLA",
        sla_estado: "en_tiempo",
      })
      .select("id")
      .single();

    if (errCita) {
      console.error("Error al insertar cita en agenda:", errCita);
      return { ok: false, error: errCita.message };
    }

    // 2. Si vino de una solicitud de proveedor, marcarla como confirmada
    if (input.solicitudId) {
      await sb
        .from("solicitudes_proveedor")
        .update({
          estado: "confirmada",
          fecha_acordada: `${input.fecha} ${input.horaInicio}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.solicitudId);
    }

    revalidatePath("/agenda");
    revalidatePath("/coordinaciones");
    return { ok: true, citaId: cita?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo agendar la cita." };
  }
}
