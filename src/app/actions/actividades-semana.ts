"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono, obtenerTelLink } from "@/lib/telefono";

export interface ActividadSemanaItem {
  id: string;
  tipo: "instalacion" | "inspeccion";
  tipoLabel: "Instalación" | "Inspección";
  origen: "agenda" | "orden_trabajo";
  fecha: string; // YYYY-MM-DD
  diaSemanaNombre: string; // Lunes, Martes, etc.
  horaInicio: string; // 10:00 AM
  horaFin: string; // 12:00 PM
  horaRaw: string; // 10:00:00
  clienteNombre: string;
  clienteTelefono: string;
  clienteTelefonoLink: string;
  clienteWhatsAppLink: string;
  direccion: string;
  fraccionamiento: string;
  estado: string;
  estadoLabel: string;
  notas: string;
  responsables: string[];
  expedienteId?: string | null;
  cotizacionId?: string | null;
  prospectoId?: string | null;
  ordenTrabajoId?: string | null;
  ordenTrabajoFolio?: string | null;
  esHoy: boolean;
}

export interface DiaSemanaInfo {
  fecha: string; // YYYY-MM-DD
  diaNombre: string; // Lun, Mar, Mié, etc.
  diaNombreCompleto: string; // Lunes, Martes...
  diaNumero: number;
  mesNombre: string;
  esHoy: boolean;
  totalActividades: number;
  totalInstalaciones: number;
  totalInspecciones: number;
}

export interface ResumenSemanaActividades {
  ok: boolean;
  rangoTexto: string;
  semanaOffset: number;
  esSemanaActual: boolean;
  fechaHoy: string;
  dias: DiaSemanaInfo[];
  actividades: ActividadSemanaItem[];
  conteoTotal: number;
  conteoInstalaciones: number;
  conteoInspecciones: number;
  conteoHoy: number;
  error?: string;
}

function formatHora12(h?: string | null): string {
  if (!h) return "";
  const parts = h.slice(0, 5).split(":");
  if (parts.length < 2) return h;
  let hrs = parseInt(parts[0], 10);
  const mins = parts[1];
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  return `${hrs}:${mins} ${ampm}`;
}

function mapearEstado(estado?: string | null): { estado: string; label: string } {
  const e = (estado || "pendiente").toLowerCase();
  switch (e) {
    case "confirmada":
      return { estado: "confirmada", label: "Confirmada" };
    case "en_proceso":
      return { estado: "en_proceso", label: "En Proceso" };
    case "completada":
    case "realizada":
    case "finalizada":
      return { estado: "completada", label: "Completada" };
    case "cancelada":
      return { estado: "cancelada", label: "Cancelada" };
    default:
      return { estado: "pendiente", label: "Pendiente" };
  }
}

/**
 * Obtiene las actividades (instalaciones e inspecciones) de la semana corriente (o desplazada por semanaOffset).
 * Filtra citas activas/pendientes para mostrar los próximos compromisos del equipo.
 */
export async function obtenerActividadesSemana(semanaOffset: number = 0): Promise<ResumenSemanaActividades> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Calcular fecha local actual de México
    const ahora = new Date();
    const fechaLocalStr = ahora.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }); // "YYYY-MM-DD"
    const [y, m, d] = fechaLocalStr.split("-").map(Number);
    const fechaHoyObj = new Date(y, m - 1, d);

    // Calcular lunes de la semana (0 = Domingo, 1 = Lunes, ..., 6 = Sábado)
    const diaSemanaNum = fechaHoyObj.getDay();
    const diffAlLunes = (diaSemanaNum === 0 ? -6 : 1) - diaSemanaNum + (semanaOffset * 7);
    const fechaLunes = new Date(fechaHoyObj);
    fechaLunes.setDate(fechaHoyObj.getDate() + diffAlLunes);

    const nombresDiasCortos = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const nombresDiasCompletos = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const nombresMesesCortos = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    const dias: DiaSemanaInfo[] = [];
    for (let i = 0; i < 7; i++) {
      const dTemp = new Date(fechaLunes);
      dTemp.setDate(fechaLunes.getDate() + i);
      const fStr = `${dTemp.getFullYear()}-${String(dTemp.getMonth() + 1).padStart(2, "0")}-${String(dTemp.getDate()).padStart(2, "0")}`;
      const dayIdx = dTemp.getDay();
      dias.push({
        fecha: fStr,
        diaNombre: nombresDiasCortos[dayIdx],
        diaNombreCompleto: nombresDiasCompletos[dayIdx],
        diaNumero: dTemp.getDate(),
        mesNombre: nombresMesesCortos[dTemp.getMonth()],
        esHoy: fStr === fechaLocalStr,
        totalActividades: 0,
        totalInstalaciones: 0,
        totalInspecciones: 0,
      });
    }

    const fechaInicio = dias[0].fecha;
    const fechaFin = dias[6].fecha;
    const rangoTexto = `${dias[0].diaNumero} ${dias[0].mesNombre} — ${dias[6].diaNumero} ${dias[6].mesNombre} ${dias[6].fecha.slice(0, 4)}`;

    // 2. Consultar agenda_citas en el rango de la semana (excluyendo sólo
    // canceladas: las ya ejecutadas/completadas SÍ se incluyen, para que el
    // tablero muestre todo lo de la semana -pasado y próximo-, no sólo lo
    // pendiente. El estado se refleja en la tarjeta con su propio badge.
    // Consulta plana, SIN joins embebidos de PostgREST ("*, perfiles(nombre)"):
    // en este proyecto ya se identificó que ese tipo de embed falla de forma
    // intermitente en producción (ver el mismo fix en listarComisiones,
    // sincronizarComision*, obtenerDatosProgramacionInstalacion y
    // programarInstalacionYDetonarOT). Cuando fallaba aquí, se perdían TODAS
    // las citas de agenda_citas de la semana (instalaciones e inspecciones
    // agendadas ahí), dejando sólo las actividades que vienen de
    // ordenes_trabajo (fuente de datos independiente).
    const { data: citasRaw, error: errCitas } = await sb
      .from("agenda_citas")
      .select("*")
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin)
      .neq("estado", "cancelada")
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true });

    if (errCitas) {
      console.error("Error al consultar agenda_citas para actividades de la semana:", errCitas);
    }

    // 3. Consultar ordenes_trabajo en el rango de la semana (excluyendo sólo
    // canceladas, por la misma razón que en agenda_citas arriba).
    const { data: otsRaw, error: errOTs } = await sb
      .from("ordenes_trabajo")
      .select(`
        id,
        folio,
        titulo,
        descripcion,
        fecha_programada,
        estatus,
        expediente_id,
        cotizacion_id,
        prospecto_id,
        asesor_ejecutor_id,
        asesor_responsable_id
      `)
      .gte("fecha_programada", fechaInicio)
      .lte("fecha_programada", fechaFin)
      .neq("estatus", "cancelada")
      .order("fecha_programada", { ascending: true });

    if (errOTs) {
      console.error("Error al consultar ordenes_trabajo para actividades de la semana:", errOTs);
    }

    // 4. Recopilar IDs para enriquecer nombres y ubicaciones
    const setPerfilIds = new Set<string>();
    const setExpIds = new Set<string>();
    const setProsIds = new Set<string>();

    (citasRaw || []).forEach((c: any) => {
      if (c.perfil_id) setPerfilIds.add(c.perfil_id);
      if (Array.isArray(c.asignados_ids)) {
        c.asignados_ids.forEach((id: string) => id && setPerfilIds.add(id));
      }
      if (c.expediente_id) setExpIds.add(c.expediente_id);
      if (c.prospecto_id) setProsIds.add(c.prospecto_id);
    });

    (otsRaw || []).forEach((ot: any) => {
      if (ot.asesor_ejecutor_id) setPerfilIds.add(ot.asesor_ejecutor_id);
      if (ot.asesor_responsable_id) setPerfilIds.add(ot.asesor_responsable_id);
      if (ot.expediente_id) setExpIds.add(ot.expediente_id);
      if (ot.prospecto_id) setProsIds.add(ot.prospecto_id);
    });

    // Traer catálogo de perfiles para resolver asignados
    const mapaPerfiles = new Map<string, string>();
    if (setPerfilIds.size > 0) {
      const { data: perfilesData } = await sb
        .from("perfiles")
        .select("id, nombre")
        .in("id", Array.from(setPerfilIds));
      (perfilesData || []).forEach((p: any) => mapaPerfiles.set(p.id, p.nombre));
    }

    // Traer expedientes para complementar direcciones y clientes
    const mapaExpedientes = new Map<string, { cliente: string; primer_apellido?: string; telefono?: string; direccion_propiedad?: string; fraccionamiento?: string }>();
    if (setExpIds.size > 0) {
      const { data: expsData } = await sb
        .from("expedientes")
        .select("id, cliente, primer_apellido, telefono, direccion_propiedad, fraccionamiento")
        .in("id", Array.from(setExpIds));
      (expsData || []).forEach((e: any) => mapaExpedientes.set(e.id, e));
    }

    // Traer prospectos
    const mapaProspectos = new Map<string, { nombre: string; primer_apellido?: string; telefono?: string; direccion?: string; ciudad?: string }>();
    if (setProsIds.size > 0) {
      const { data: prosData } = await sb
        .from("prospectos")
        .select("id, nombre, primer_apellido, telefono, direccion, ciudad")
        .in("id", Array.from(setProsIds));
      (prosData || []).forEach((p: any) => mapaProspectos.set(p.id, p));
    }

    // 5. Procesar citas y clasificar
    const actividades: ActividadSemanaItem[] = [];
    const idsCitasProcesadas = new Set<string>();

    for (const c of (citasRaw || []) as any[]) {
      const tipoRaw = (c.tipo_cita || "").toLowerCase();
      const notasLower = (c.notas || "").toLowerCase();

      let tipo: "instalacion" | "inspeccion" | null = null;
      if (tipoRaw === "instalacion" || notasLower.includes("instalaci")) {
        tipo = "instalacion";
      } else if (
        tipoRaw === "inspeccion" ||
        tipoRaw === "visita" ||
        notasLower.includes("inspecci") ||
        notasLower.includes("visita")
      ) {
        tipo = "inspeccion";
      }

      // Si no es explícita, se considera inspección técnica / visita de servicio
      if (!tipo) {
        tipo = "inspeccion";
      }

      const exp = c.expediente_id ? mapaExpedientes.get(c.expediente_id) : null;
      const prsp = c.prospecto_id ? mapaProspectos.get(c.prospecto_id) : null;

      // Nombre del cliente
      let clienteNombre = (c.cliente_nombre || "").trim();
      if (!clienteNombre || clienteNombre.toLowerCase() === "null") {
        if (exp) {
          clienteNombre = `${exp.cliente || ""} ${exp.primer_apellido || ""}`.trim();
        } else if (prsp) {
          clienteNombre = `${prsp.nombre || ""} ${prsp.primer_apellido || ""}`.trim();
        }
      }
      if (!clienteNombre) clienteNombre = "Cliente Sauceda";

      // Teléfono del cliente
      const telBruto = c.cliente_telefono || exp?.telefono || prsp?.telefono || "";
      const telCanon = normalizarTelefono(telBruto);
      const telLink = obtenerTelLink(telBruto);
      const waLink = telCanon ? `https://wa.me/${telCanon}` : "";

      // Fraccionamiento y dirección
      const fraccionamiento =
        c.fraccionamiento ||
        exp?.fraccionamiento ||
        prsp?.ciudad ||
        "León, Gto.";

      const direccion =
        exp?.direccion_propiedad ||
        prsp?.direccion ||
        (fraccionamiento ? `Col. ${fraccionamiento}` : "León, Gto.");

      // Responsables asignados
      const idsResp: string[] = Array.isArray(c.asignados_ids) && c.asignados_ids.length > 0
        ? c.asignados_ids
        : (c.perfil_id ? [c.perfil_id] : []);
      const responsables = idsResp
        .map((id) => mapaPerfiles.get(id))
        .filter(Boolean) as string[];

      // Buscar si tiene OT vinculada
      const otMatch = (otsRaw || []).find((ot: any) =>
        (c.expediente_id && ot.expediente_id === c.expediente_id && ot.fecha_programada === c.fecha) ||
        (c.cotizacion_id && ot.cotizacion_id === c.cotizacion_id)
      );

      const st = mapearEstado(c.estado);
      const diaObj = dias.find((d) => d.fecha === c.fecha);

      actividades.push({
        id: c.id,
        tipo,
        tipoLabel: tipo === "instalacion" ? "Instalación" : "Inspección",
        origen: "agenda",
        fecha: c.fecha,
        diaSemanaNombre: diaObj?.diaNombreCompleto || "Día",
        horaInicio: formatHora12(c.hora_inicio) || "Horario pendiente",
        horaFin: formatHora12(c.hora_fin) || "",
        horaRaw: c.hora_inicio || "09:00:00",
        clienteNombre,
        clienteTelefono: telBruto,
        clienteTelefonoLink: telLink,
        clienteWhatsAppLink: waLink,
        direccion,
        fraccionamiento,
        estado: st.estado,
        estadoLabel: st.label,
        notas: c.notas || "",
        responsables: responsables.length > 0 ? responsables : ["Equipo Sauceda"],
        expedienteId: c.expediente_id || null,
        cotizacionId: c.cotizacion_id || null,
        prospectoId: c.prospecto_id || null,
        ordenTrabajoId: otMatch?.id || null,
        ordenTrabajoFolio: otMatch?.folio || null,
        esHoy: c.fecha === fechaLocalStr,
      });

      idsCitasProcesadas.add(c.id);
      if (otMatch) idsCitasProcesadas.add(otMatch.id);
    }

    // 6. Procesar órdenes de trabajo que no estén ya reflejadas en citas
    for (const ot of (otsRaw || []) as any[]) {
      if (idsCitasProcesadas.has(ot.id)) continue;
      const yaCubierta = actividades.some(
        (a) => a.cotizacionId && a.cotizacionId === ot.cotizacion_id && a.fecha === ot.fecha_programada
      );
      if (yaCubierta) continue;

      const exp = ot.expediente_id ? mapaExpedientes.get(ot.expediente_id) : null;
      const prsp = ot.prospecto_id ? mapaProspectos.get(ot.prospecto_id) : null;

      let clienteNombre = "";
      if (exp) {
        clienteNombre = `${exp.cliente || ""} ${exp.primer_apellido || ""}`.trim();
      } else if (prsp) {
        clienteNombre = `${prsp.nombre || ""} ${prsp.primer_apellido || ""}`.trim();
      }
      if (!clienteNombre) clienteNombre = ot.titulo || "Cliente Sauceda";

      const telBruto = exp?.telefono || prsp?.telefono || "";
      const telCanon = normalizarTelefono(telBruto);
      const telLink = obtenerTelLink(telBruto);
      const waLink = telCanon ? `https://wa.me/${telCanon}` : "";

      const fraccionamiento = exp?.fraccionamiento || prsp?.ciudad || "León, Gto.";
      const direccion = exp?.direccion_propiedad || prsp?.direccion || `Col. ${fraccionamiento}`;

      const resps: string[] = [];
      if (ot.asesor_ejecutor_id && mapaPerfiles.has(ot.asesor_ejecutor_id)) {
        resps.push(mapaPerfiles.get(ot.asesor_ejecutor_id)!);
      }
      if (ot.asesor_responsable_id && mapaPerfiles.has(ot.asesor_responsable_id)) {
        const rName = mapaPerfiles.get(ot.asesor_responsable_id)!;
        if (!resps.includes(rName)) resps.push(rName);
      }

      const st = mapearEstado(ot.estatus);
      const diaObj = dias.find((d) => d.fecha === ot.fecha_programada);

      actividades.push({
        id: ot.id,
        tipo: "instalacion",
        tipoLabel: "Instalación",
        origen: "orden_trabajo",
        fecha: ot.fecha_programada,
        diaSemanaNombre: diaObj?.diaNombreCompleto || "Día",
        horaInicio: "09:00 AM",
        horaFin: "01:00 PM",
        horaRaw: "09:00:00",
        clienteNombre,
        clienteTelefono: telBruto,
        clienteTelefonoLink: telLink,
        clienteWhatsAppLink: waLink,
        direccion,
        fraccionamiento,
        estado: st.estado,
        estadoLabel: st.label,
        notas: ot.descripcion || ot.titulo || "",
        responsables: resps.length > 0 ? resps : ["Cuadrilla Operativa"],
        expedienteId: ot.expediente_id || null,
        cotizacionId: ot.cotizacion_id || null,
        prospectoId: ot.prospecto_id || null,
        ordenTrabajoId: ot.id,
        ordenTrabajoFolio: ot.folio,
        esHoy: ot.fecha_programada === fechaLocalStr,
      });
    }

    // 6b. Incluir propuestas de inspección de la "Cabina de Coordinación" que
    // aún no se confirman en agenda_citas (estado evaluando / propuesta
    // enviada / enviado_cliente). Mientras el cliente o los asesores no
    // cierren la cita definitiva no existe fila en agenda_citas, así que sin
    // esto la inspección "agendada" (en proceso de coordinación) no aparecía
    // en las Actividades de la Semana aunque ya tuviera opciones de horario
    // propuestas dentro del rango.
    try {
      const { data: coordsPendientes } = await sb
        .from("coordinaciones_inspeccion")
        .select("*")
        .in("estado", ["propuesta_enviada", "evaluando", "enviado_cliente"]);

      for (const coord of (coordsPendientes || []) as any[]) {
        const opciones: Array<{ fecha: string; horaInicio: string; horaFin: string }> =
          Array.isArray(coord.opciones_horarios) ? coord.opciones_horarios : [];
        const opcionEnSemana = opciones
          .filter((o) => o?.fecha >= fechaInicio && o?.fecha <= fechaFin)
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.horaInicio || "").localeCompare(b.horaInicio || ""))[0];

        if (!opcionEnSemana) continue;

        const exp = coord.expediente_id ? mapaExpedientes.get(coord.expediente_id) : null;
        const prsp = coord.prospecto_id ? mapaProspectos.get(coord.prospecto_id) : null;

        const telBruto = coord.cliente_telefono || exp?.telefono || prsp?.telefono || "";
        const telCanon = normalizarTelefono(telBruto);
        const telLink = obtenerTelLink(telBruto);
        const waLink = telCanon ? `https://wa.me/${telCanon}` : "";

        const fraccionamiento = coord.fraccionamiento || coord.ubicacion || "León, Gto.";
        const asesoresIds: string[] = Array.isArray(coord.asesores_ids) ? coord.asesores_ids : [];
        const responsables = asesoresIds
          .map((id) => mapaPerfiles.get(id))
          .filter(Boolean) as string[];

        const diaObj = dias.find((d) => d.fecha === opcionEnSemana.fecha);
        const totalOpciones = opciones.length;

        actividades.push({
          id: `coord-${coord.id}`,
          tipo: "inspeccion",
          tipoLabel: "Inspección",
          origen: "agenda",
          fecha: opcionEnSemana.fecha,
          diaSemanaNombre: diaObj?.diaNombreCompleto || "Día",
          horaInicio: formatHora12(opcionEnSemana.horaInicio) || "Horario pendiente",
          horaFin: formatHora12(opcionEnSemana.horaFin) || "",
          horaRaw: opcionEnSemana.horaInicio || "09:00:00",
          clienteNombre: coord.cliente_nombre || "Cliente Sauceda",
          clienteTelefono: telBruto,
          clienteTelefonoLink: telLink,
          clienteWhatsAppLink: waLink,
          direccion: coord.ubicacion || fraccionamiento,
          fraccionamiento,
          estado: "pendiente",
          estadoLabel: `Por Confirmar (${totalOpciones} opción${totalOpciones === 1 ? "" : "es"})`,
          notas: `Coordinación en curso: ${coord.servicio_nombre || coord.servicio_tipo || "inspección técnica"}. Aún sin confirmar con el cliente/equipo.`,
          responsables: responsables.length > 0 ? responsables : ["Equipo Sauceda"],
          expedienteId: coord.expediente_id || null,
          cotizacionId: null,
          prospectoId: coord.prospecto_id || null,
          ordenTrabajoId: null,
          ordenTrabajoFolio: null,
          esHoy: opcionEnSemana.fecha === fechaLocalStr,
        });
      }
    } catch (errCoord) {
      console.error("Aviso: no se pudieron incluir coordinaciones de inspección pendientes:", errCoord);
    }

    // 7. Ordenar todas las actividades por fecha y luego por hora
    actividades.sort((a, b) => {
      const cmpFecha = a.fecha.localeCompare(b.fecha);
      if (cmpFecha !== 0) return cmpFecha;
      return a.horaRaw.localeCompare(b.horaRaw);
    });

    // 8. Actualizar contadores por día
    let conteoInstalaciones = 0;
    let conteoInspecciones = 0;
    let conteoHoy = 0;

    for (const act of actividades) {
      if (act.tipo === "instalacion") conteoInstalaciones++;
      if (act.tipo === "inspeccion") conteoInspecciones++;
      if (act.esHoy) conteoHoy++;

      const dia = dias.find((d) => d.fecha === act.fecha);
      if (dia) {
        dia.totalActividades++;
        if (act.tipo === "instalacion") dia.totalInstalaciones++;
        if (act.tipo === "inspeccion") dia.totalInspecciones++;
      }
    }

    return {
      ok: true,
      rangoTexto,
      semanaOffset,
      esSemanaActual: semanaOffset === 0,
      fechaHoy: fechaLocalStr,
      dias,
      actividades,
      conteoTotal: actividades.length,
      conteoInstalaciones,
      conteoInspecciones,
      conteoHoy,
    };
  } catch (err: any) {
    console.error("Error catastrófico en obtenerActividadesSemana:", err);
    return {
      ok: false,
      rangoTexto: "Semana Actual",
      semanaOffset,
      esSemanaActual: semanaOffset === 0,
      fechaHoy: new Date().toISOString().slice(0, 10),
      dias: [],
      actividades: [],
      conteoTotal: 0,
      conteoInstalaciones: 0,
      conteoInspecciones: 0,
      conteoHoy: 0,
      error: err?.message || "Error al consultar actividades de la semana",
    };
  }
}
