"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { evaluarReglasDeAvance } from "@/lib/motor-procesos";
import type {
  ProcesoMaestro,
  EtapaConfiguracion,
  EscalacionConfiguracion,
  AutomatizacionConfiguracion,
  ReglaValidacion,
} from "@/lib/types";

/** Listar todos los procesos maestros registrados. */
export async function listarProcesosMaestros(): Promise<ProcesoMaestro[]> {
  const sb = supabaseServidor();
  const { data: procesosData, error: errProc } = await sb
    .from("procesos_maestros")
    .select("*")
    .order("created_at", { ascending: false });

  if (errProc || !procesosData) {
    console.error("Error al listar procesos maestros:", errProc?.message);
    return [];
  }

  const pIds = procesosData.map((p) => p.id);
  let etapasData: any[] = [];
  if (pIds.length > 0) {
    const { data: eData } = await sb
      .from("etapas_configuracion")
      .select("*")
      .in("proceso_id", pIds)
      .order("orden", { ascending: true });
    etapasData = eData || [];
  }

  return procesosData.map((p: any) => {
    const misEtapas = etapasData.filter((e) => e.proceso_id === p.id);
    return {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion || "",
      tipoNegocio: p.tipo_negocio,
      entidadTarget: p.entidad_target || "expediente",
      activo: p.activo ?? true,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      etapas: misEtapas
        .map((e: any) => ({
          id: e.id,
          procesoId: e.proceso_id,
          claveEtapa: e.clave_etapa,
          nombre: e.nombre,
          orden: e.orden,
          slaDias: e.sla_dias,
          entidadTarget: e.entidad_target || "expediente",
          camposRequeridos: e.campos_requeridos || [],
          validaciones: e.validaciones_json || [],
          createdAt: e.created_at,
        }))
        .sort((a, b) => a.orden - b.orden),
    };
  });
}

/** Obtener la estructura completa de un proceso maestro por ID. */
export async function obtenerProcesoCompleto(procesoId: string): Promise<ProcesoMaestro | null> {
  const sb = supabaseServidor();
  const { data: proc, error: errProc } = await sb
    .from("procesos_maestros")
    .select("*")
    .eq("id", procesoId)
    .maybeSingle();

  if (errProc || !proc) {
    console.error("Error al obtener proceso completo:", errProc?.message);
    return null;
  }

  const { data: eData } = await sb
    .from("etapas_configuracion")
    .select("*")
    .eq("proceso_id", procesoId)
    .order("orden", { ascending: true });

  const { data: escData } = await sb
    .from("escalaciones_configuracion")
    .select("*")
    .eq("proceso_id", procesoId);

  const { data: autData } = await sb
    .from("automatizaciones_configuracion")
    .select("*")
    .eq("proceso_id", procesoId);

  return {
    id: proc.id,
    nombre: proc.nombre,
    descripcion: proc.descripcion || "",
    tipoNegocio: proc.tipo_negocio,
    entidadTarget: proc.entidad_target || "expediente",
    activo: proc.activo ?? true,
    createdAt: proc.created_at,
    updatedAt: proc.updated_at,
    etapas: (eData || [])
      .map((e: any) => ({
        id: e.id,
        procesoId: e.proceso_id,
        claveEtapa: e.clave_etapa,
        nombre: e.nombre,
        orden: e.orden,
        slaDias: e.sla_dias,
        entidadTarget: e.entidad_target || "expediente",
        camposRequeridos: e.campos_requeridos || [],
        validaciones: e.validaciones_json || [],
        createdAt: e.created_at,
      }))
      .sort((a, b) => a.orden - b.orden),
    escalaciones: (escData || []).map((esc: any) => ({
      id: esc.id,
      procesoId: esc.proceso_id,
      etapaId: esc.etapa_id,
      nombreRegla: esc.nombre_regla,
      condicion: esc.condicion_json || {},
      accionTipo: esc.accion_tipo,
      parametros: esc.parametros_json || {},
      activo: esc.activo ?? true,
      createdAt: esc.created_at,
    })),
    automatizaciones: (autData || []).map((aut: any) => ({
      id: aut.id,
      procesoId: aut.proceso_id,
      etapaId: aut.etapa_id,
      eventoTipo: aut.evento_tipo,
      webhookUrlN8n: aut.webhook_url_n8n,
      payloadTemplate: aut.payload_template_json || {},
      activo: aut.activo ?? true,
      createdAt: aut.created_at,
    })),
  };
}

/** Crear un nuevo proceso maestro con etapas por defecto. */
export async function crearProceso(datos: {
  nombre: string;
  descripcion?: string;
  tipoNegocio: string;
  entidadTarget?: "expediente" | "prospecto";
}): Promise<ProcesoMaestro> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("procesos_maestros")
    .insert({
      nombre: datos.nombre,
      descripcion: datos.descripcion || "",
      tipo_negocio: datos.tipoNegocio,
      entidad_target: datos.entidadTarget || "expediente",
      activo: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Error al crear proceso: ${error.message}`);

  // Insertar etapas base por defecto
  const etapasBase = [
    { clave_etapa: "nuevo-lead", nombre: "Prospecto / Lead Recibido", orden: 1, sla_dias: 2 },
    { clave_etapa: "negociacion", nombre: "Negociación / Evaluación", orden: 2, sla_dias: 7 },
    { clave_etapa: "expediente", nombre: "Expediente / Trámite", orden: 3, sla_dias: 14 },
    { clave_etapa: "firmado", nombre: "Firma / Ejecución", orden: 4, sla_dias: 5 },
  ];

  await sb.from("etapas_configuracion").insert(
    etapasBase.map((e) => ({
      proceso_id: data.id,
      ...e,
      campos_requeridos: [],
      validaciones_json: [],
    }))
  );

  return (await obtenerProcesoCompleto(data.id))!;
}

/** Duplicar un proceso existente con todas sus etapas y reglas. */
export async function duplicarProceso(
  procesoId: string,
  nuevoNombre: string,
  nuevoTipoNegocio: string,
  entidadTarget?: "expediente" | "prospecto"
): Promise<ProcesoMaestro> {
  await requireAdministrador();
  const original = await obtenerProcesoCompleto(procesoId);
  if (!original) throw new Error("Proceso original no encontrado.");

  const sb = supabaseServidor();

  const { data: nuevo, error } = await sb
    .from("procesos_maestros")
    .insert({
      nombre: nuevoNombre,
      descripcion: `Copia de ${original.nombre}. ${original.descripcion}`,
      tipo_negocio: nuevoTipoNegocio,
      entidad_target: entidadTarget || original.entidadTarget || "expediente",
      activo: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Error al duplicar proceso: ${error.message}`);

  // Duplicar Etapas
  if (original.etapas && original.etapas.length > 0) {
    const etapasInsert = original.etapas.map((e) => ({
      proceso_id: nuevo.id,
      clave_etapa: e.claveEtapa,
      nombre: e.nombre,
      orden: e.orden,
      sla_dias: e.slaDias,
      campos_requeridos: e.camposRequeridos,
      validaciones_json: e.validaciones,
    }));
    await sb.from("etapas_configuracion").insert(etapasInsert);
  }

  return (await obtenerProcesoCompleto(nuevo.id))!;
}

/** Actualizar metadatos de un proceso maestro. */
export async function actualizarProceso(
  procesoId: string,
  datos: {
    nombre?: string;
    descripcion?: string;
    entidadTarget?: "expediente" | "prospecto";
    activo?: boolean;
  }
): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };
  if (datos.nombre !== undefined) updateObj.nombre = datos.nombre;
  if (datos.descripcion !== undefined) updateObj.descripcion = datos.descripcion;
  if (datos.entidadTarget !== undefined) updateObj.entidad_target = datos.entidadTarget;
  if (datos.activo !== undefined) updateObj.activo = datos.activo;

  const { error } = await sb.from("procesos_maestros").update(updateObj).eq("id", procesoId);
  if (error) throw new Error(error.message);
}

/** Eliminar un proceso maestro. */
export async function eliminarProceso(procesoId: string): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { error } = await sb.from("procesos_maestros").delete().eq("id", procesoId);
  if (error) throw new Error(error.message);
}

/** Guardar etapas de un proceso (modificación de orden, SLAs, campos y reglas). */
export async function guardarEtapasProceso(
  procesoId: string,
  etapas: EtapaConfiguracion[]
): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Limpiar etapas existentes y reinsertar con el nuevo orden y parámetros
  await sb.from("etapas_configuracion").delete().eq("proceso_id", procesoId);

  const insertData = etapas.map((e, idx) => ({
    proceso_id: procesoId,
    clave_etapa: e.claveEtapa || `etapa-${idx + 1}`,
    nombre: e.nombre,
    orden: idx + 1,
    sla_dias: Number(e.slaDias) || 7,
    entidad_target: e.entidadTarget || "expediente",
    campos_requeridos: e.camposRequeridos || [],
    validaciones_json: e.validaciones || [],
  }));

  const { error } = await sb.from("etapas_configuracion").insert(insertData);
  if (error) throw new Error(`Error al guardar etapas: ${error.message}`);
}

/** Guardar escalaciones de un proceso. */
export async function guardarEscalaciones(
  procesoId: string,
  escalaciones: EscalacionConfiguracion[]
): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();

  await sb.from("escalaciones_configuracion").delete().eq("proceso_id", procesoId);

  if (escalaciones.length === 0) return;

  const insertData = escalaciones.map((esc) => ({
    proceso_id: procesoId,
    etapa_id: esc.etapaId || null,
    nombre_regla: esc.nombreRegla,
    condicion_json: esc.condicion || {},
    accion_tipo: esc.accionTipo,
    parametros_json: esc.parametros || {},
    activo: esc.activo ?? true,
  }));

  const { error } = await sb.from("escalaciones_configuracion").insert(insertData);
  if (error) throw new Error(`Error al guardar escalaciones: ${error.message}`);
}

/** Guardar automatizaciones / webhooks n8n de un proceso. */
export async function guardarAutomatizaciones(
  procesoId: string,
  automatizaciones: AutomatizacionConfiguracion[]
): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();

  await sb.from("automatizaciones_configuracion").delete().eq("proceso_id", procesoId);

  if (automatizaciones.length === 0) return;

  const insertData = automatizaciones.map((aut) => ({
    proceso_id: procesoId,
    etapa_id: aut.etapaId || null,
    evento_tipo: aut.eventoTipo,
    webhook_url_n8n: aut.webhookUrlN8n,
    payload_template_json: aut.payloadTemplate || {},
    activo: aut.activo ?? true,
  }));

  const { error } = await sb.from("automatizaciones_configuracion").insert(insertData);
  if (error) throw new Error(`Error al guardar automatizaciones n8n: ${error.message}`);
}

/** Probador / Simulador de Reglas de Avance. */
export async function testearReglasProceso(
  procesoId: string,
  claveEtapa: string,
  datosDummy: Record<string, any>
): Promise<{ valido: boolean; errores: string[] }> {
  const proceso = await obtenerProcesoCompleto(procesoId);
  if (!proceso) throw new Error("Proceso no encontrado.");

  const etapa = (proceso.etapas || []).find((e) => e.claveEtapa === claveEtapa);
  if (!etapa) throw new Error(`Etapa '${claveEtapa}' no encontrada en el proceso.`);

  return evaluarReglasDeAvance(datosDummy, etapa);
}
