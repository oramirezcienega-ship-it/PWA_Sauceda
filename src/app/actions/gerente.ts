"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

export interface AlertaOperacion {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  prioridad: "baja" | "media" | "alta" | "critica";
  estatus: "pendiente" | "en_revision" | "resuelta" | "descartada";
  entidad_tipo?: string | null;
  entidad_id?: string | null;
  metadatos?: Record<string, any>;
  sugerencia_ia?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OptimizacionBacklog {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: "codigo" | "automatizacion" | "proceso" | "base_datos";
  codigo_propuesto: string;
  archivo_destino: string;
  parche_diff?: string | null;
  prioridad: "baja" | "media" | "alta" | "critica";
  estatus: "propuesto" | "aprobado" | "rechazado" | "aplicado" | "fallido";
  resultado_aplicacion?: string | null;
  creado_por: string;
  aprobado_por?: string | null;
  fecha_aprobacion?: string | null;
  fecha_aplicacion?: string | null;
  metadatos?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Obtener todas las alertas operativas ordenadas por prioridad y fecha
 */
export async function obtenerAlertasOperaciones(): Promise<AlertaOperacion[]> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("alertas_operaciones")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error obteniendo alertas_operaciones:", error);
    return [];
  }
  return (data || []) as AlertaOperacion[];
}

/**
 * Actualizar el estado de una alerta
 */
export async function actualizarEstatusAlerta(
  id: string,
  estatus: "pendiente" | "en_revision" | "resuelta" | "descartada"
) {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("alertas_operaciones")
    .update({ estatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Error actualizando alerta: ${error.message}`);
  revalidatePath("/admin/gerente");
  revalidatePath("/gerente");
}

/**
 * Obtener las propuestas del backlog de optimizaciones
 */
export async function obtenerOptimizacionesBacklog(): Promise<OptimizacionBacklog[]> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("optimizaciones_backlog")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error obteniendo optimizaciones_backlog:", error);
    return [];
  }
  return (data || []) as OptimizacionBacklog[];
}

/**
 * Aprobar o Rechazar propuesta de optimización
 */
export async function actualizarEstatusOptimizacion(
  id: string,
  estatus: "propuesto" | "aprobado" | "rechazado"
) {
  const admin = await requireAdministrador();
  const sb = supabaseServidor();

  const updateData: Record<string, any> = {
    estatus,
    updated_at: new Date().toISOString(),
  };

  if (estatus === "aprobado") {
    updateData.fecha_aprobacion = new Date().toISOString();
  }

  const { error } = await sb
    .from("optimizaciones_backlog")
    .update(updateData)
    .eq("id", id);

  if (error) throw new Error(`Error actualizando optimización: ${error.message}`);
  revalidatePath("/admin/gerente");
  revalidatePath("/gerente");
}

/**
 * Aplicar un parche de código aprobado directamente a los archivos del proyecto
 */
export async function aplicarOptimizacionParche(id: string) {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Obtener la propuesta
  const { data: item, error: fetchErr } = await sb
    .from("optimizaciones_backlog")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !item) {
    throw new Error("No se encontró la propuesta de optimización.");
  }

  const archivoDestino: string = item.archivo_destino;
  const codigoPropuesto: string = item.codigo_propuesto;

  if (!archivoDestino || !codigoPropuesto) {
    throw new Error("La propuesta no especifica archivo destino o código propuesto.");
  }

  const rootDir = process.cwd();
  const fullPath = path.resolve(rootDir, archivoDestino.replace(/^\//, ""));

  // Validación de seguridad para prevenir traversals
  if (!fullPath.startsWith(rootDir)) {
    throw new Error("Intento inválido de escritura fuera del directorio del proyecto.");
  }

  let msgResultado = "";
  try {
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (fs.existsSync(fullPath)) {
      const contenidoActual = fs.readFileSync(fullPath, "utf-8");
      if (contenidoActual.includes(codigoPropuesto.trim())) {
        msgResultado = "El código propuesto ya existía previamente en el archivo.";
      } else {
        const nuevoContenido = `${contenidoActual.trimEnd()}\n\n${codigoPropuesto.trim()}\n`;
        fs.writeFileSync(fullPath, nuevoContenido, "utf-8");
        msgResultado = `Parche fusionado correctamente en ${archivoDestino}.`;
      }
    } else {
      fs.writeFileSync(fullPath, `${codigoPropuesto.trim()}\n`, "utf-8");
      msgResultado = `Nuevo archivo creado con el parche en ${archivoDestino}.`;
    }

    const { error: updateErr } = await sb
      .from("optimizaciones_backlog")
      .update({
        estatus: "aplicado",
        fecha_aplicacion: new Date().toISOString(),
        resultado_aplicacion: msgResultado,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) throw updateErr;

    revalidatePath("/admin/gerente");
    revalidatePath("/gerente");
    return { ok: true, mensaje: msgResultado };
  } catch (err: any) {
    const errorMsg = `Error aplicando parche: ${err.message}`;
    await sb
      .from("optimizaciones_backlog")
      .update({
        estatus: "fallido",
        resultado_aplicacion: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    throw new Error(errorMsg);
  }
}

/**
 * Ejecutar una pasada rápida de auditoría para poblar alertas si la DB está limpia
 */
export async function ejecutarAuditoriaServidor() {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Revisar expedientes inactivos por más de 7 días
  const { data: expedientes } = await sb
    .from("expedientes")
    .select("id, cliente, etapa, updated_at, created_at, telefono")
    .limit(20);

  const alertasInsertadas: AlertaOperacion[] = [];
  const now = new Date();

  if (expedientes && expedientes.length > 0) {
    for (const exp of expedientes) {
      const fechaBase = exp.updated_at ? new Date(exp.updated_at) : new Date(exp.created_at);
      const diasInactivo = Math.floor((now.getTime() - fechaBase.getTime()) / (1000 * 3600 * 24));

      if (diasInactivo >= 7) {
        const payload = {
          tipo: "expediente_estancado",
          titulo: `Expediente ${exp.id} estancado (${diasInactivo} días)`,
          descripcion: `El expediente de ${exp.cliente || "Cliente"} no registra movimiento en la etapa '${exp.etapa || "Sin etapa"}' desde hace ${diasInactivo} días.`,
          prioridad: (diasInactivo > 14 ? "critica" : "alta") as "critica" | "alta",
          estatus: "pendiente" as "pendiente",
          entidad_tipo: "expedientes",
          entidad_id: String(exp.id),
          sugerencia_ia: `Contactar a ${exp.cliente || "el cliente"} para solicitar actualización documental.`,
          metadatos: { cliente: exp.cliente, diasInactivo },
        };

        const { data: ins } = await sb
          .from("alertas_operaciones")
          .insert(payload)
          .select()
          .single();

        if (ins) alertasInsertadas.push(ins as AlertaOperacion);
      }
    }
  }

  // Generar propuestas predeterminadas de optimización de código si el backlog está vacío
  const { count } = await sb.from("optimizaciones_backlog").select("*", { count: "exact", head: true });

  if (!count || count === 0) {
    await sb.from("optimizaciones_backlog").insert([
      {
        titulo: "Módulo de recordatorios automáticos para expedientes inactivos",
        descripcion: "Genera la función `verificarRecordatoriosExpedientes` en `src/lib/actividades.ts` para alertar automáticamente a los asesores.",
        categoria: "codigo",
        archivo_destino: "src/lib/actividades.ts",
        prioridad: "alta",
        codigo_propuesto: `/**\n * Función de optimización generada por Agente Gerente de Operaciones\n */\nexport async function verificarRecordatoriosExpedientes(diasLimite: number = 7) {\n  console.log(\`[GERENTE BOT] Auditando expedientes inactivos (\${diasLimite}d)...\`);\n  return { procesados: 0, ok: true };\n}\n`,
        parche_diff: "+++ src/lib/actividades.ts\n@@ export async function verificarRecordatoriosExpedientes @@",
        estatus: "propuesto",
        creado_por: "agente_gerente",
      },
      {
        titulo: "Optimización de Calificación Automática de Lead por WhatsApp",
        descripcion: "Introduce `clasificarPrioridadLead` en `src/lib/prospectos-status.ts` para priorizar leads calientes.",
        categoria: "codigo",
        archivo_destino: "src/lib/prospectos-status.ts",
        prioridad: "media",
        codigo_propuesto: `/**\n * Helper para clasificar prospectos inactivos\n */\nexport function clasificarPrioridadLead(dias: number, tieneTelefono: boolean): 'alta' | 'media' | 'baja' {\n  if (dias > 2 && tieneTelefono) return 'alta';\n  return dias > 1 ? 'media' : 'baja';\n}\n`,
        parche_diff: "+++ src/lib/prospectos-status.ts\n@@ export function clasificarPrioridadLead @@",
        estatus: "propuesto",
        creado_por: "agente_gerente",
      }
    ]);
  }

  revalidatePath("/admin/gerente");
  revalidatePath("/gerente");
  return { ok: true, alertasGeneradas: alertasInsertadas.length };
}
