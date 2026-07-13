"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { revalidatePath } from "next/cache";

export interface ProyectoConsejo {
  id: string;
  name: string;
  context: string;
  status: "borrador" | "cerrado";
  created_at: string;
  updated_at: string;
  alternativas_count?: number;
  ultima_pregunta?: string;
}

export interface AsesorConsejo {
  id: string;
  project_id: string;
  name: string;
  prompt: string;
  enabled: boolean;
  order: number;
}

export interface AlternativaConsejo {
  id: string;
  project_id: string;
  question: string;
  opinions: Record<string, string>;
  verdict: string | null;
  admin_notes: string | null;
  status: "Pendiente revisión" | "Descartada" | "Seleccionada";
  created_at: string;
}

// Consejeros por defecto que se agregan a todo proyecto nuevo
const ASESORES_DEFECTO = [
  {
    name: "Analista Financiero",
    prompt: "Eres un Analista Financiero experto en bienes raíces. Evalúa la viabilidad económica del proyecto. Analiza el flujo de caja, el retorno de inversión (ROI), el costo de capital, el punto de equilibrio y los riesgos financieros de la alternativa propuesta. Enfócate en maximizar la rentabilidad y mitigar pérdidas financieras en propiedades INFONAVIT.",
    order: 0,
  },
  {
    name: "Especialista INFONAVIT",
    prompt: "Eres un Especialista en trámites y normativa de INFONAVIT. Evalúa la alternativa considerando los tipos de crédito, la elegibilidad de los derechohabientes, tiempos de liberación, trámites notariales, cancelaciones de hipoteca y políticas vigentes del instituto. Señala posibles cuellos de botella administrativos y plazos estimados.",
    order: 1,
  },
  {
    name: "Estrategia Comercial",
    prompt: "Eres un Consultor en Estrategia Comercial inmobiliaria. Analiza la propuesta bajo la óptica de posicionamiento de mercado, demanda local en León, Guanajuato, competitividad, estrategia de pricing (precios), canales de captación eficaces y velocidad de absorción/venta.",
    order: 2,
  },
  {
    name: "Riesgos Legales",
    prompt: "Eres un Abogado experto en derecho inmobiliario y regularización de propiedades. Evalúa la alternativa identificando riesgos legales relacionados con escrituras, gravámenes, adeudos de agua/predial, juicios sucesorios, poderes notariales y permisos. Determina qué tan viable y seguro es el traspaso o adquisición.",
    order: 3,
  },
  {
    name: "Abogado del Diablo",
    prompt: "Eres el Abogado del Diablo. Tu única función es cuestionar y buscar fallas críticas en los supuestos de la alternativa. Identifica el peor escenario posible (worst-case scenario), sesgos de optimismo del admin, costos ocultos y debilidades lógicas de la estrategia propuesta.",
    order: 4,
  },
];

/**
 * Obtiene todos los proyectos, con opción de buscar y filtrar.
 */
export async function obtenerProyectos(filtros?: {
  busqueda?: string;
  status?: "borrador" | "cerrado" | "todos";
}): Promise<ProyectoConsejo[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  let query = sb.from("council_projects").select(`
    *,
    council_alternatives (
      id,
      question,
      created_at
    )
  `);

  if (filtros?.status && filtros.status !== "todos") {
    query = query.eq("status", filtros.status);
  }

  if (filtros?.busqueda) {
    query = query.ilike("name", `%${filtros.busqueda}%`);
  }

  query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((p: any) => {
    // Ordenar alternativas por fecha de creación descendente para sacar la última pregunta
    const alts = p.council_alternatives || [];
    const sortedAlts = [...alts].sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      id: p.id,
      name: p.name,
      context: p.context,
      status: p.status,
      created_at: p.created_at,
      updated_at: p.updated_at,
      alternativas_count: alts.length,
      ultima_pregunta: sortedAlts[0]?.question || undefined,
    };
  });
}

/**
 * Obtiene un proyecto y sus consejeros por ID.
 */
export async function obtenerProyectoPorId(id: string): Promise<{
  proyecto: ProyectoConsejo;
  asesores: AsesorConsejo[];
} | null> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data: proyecto, error: errProj } = await sb
    .from("council_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errProj) throw new Error(errProj.message);
  if (!proyecto) return null;

  const { data: asesores, error: errAdvisors } = await sb
    .from("council_advisors")
    .select("*")
    .eq("project_id", id)
    .order("order", { ascending: true });

  if (errAdvisors) throw new Error(errAdvisors.message);

  return {
    proyecto: proyecto as ProyectoConsejo,
    asesores: (asesores ?? []) as AsesorConsejo[],
  };
}

/**
 * Crea un proyecto de consejo e inyecta los 5 consejeros por defecto.
 */
export async function crearProyecto(
  name: string,
  context: string
): Promise<ProyectoConsejo> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // 1. Insertar el proyecto
  const { data: proyecto, error: errProj } = await sb
    .from("council_projects")
    .insert({
      name,
      context,
      status: "borrador",
    })
    .select()
    .single();

  if (errProj) throw new Error(errProj.message);

  // 2. Insertar los asesores por defecto en paralelo
  const advisorsToInsert = ASESORES_DEFECTO.map((a) => ({
    project_id: proyecto.id,
    name: a.name,
    prompt: a.prompt,
    enabled: true,
    order: a.order,
  }));

  const { error: errAdvisors } = await sb
    .from("council_advisors")
    .insert(advisorsToInsert);

  if (errAdvisors) {
    // Si falla la inserción de asesores, intentamos borrar el proyecto para no dejarlo huérfano
    await sb.from("council_projects").delete().eq("id", proyecto.id);
    throw new Error(errAdvisors.message);
  }

  revalidatePath("/consejo");
  return proyecto as ProyectoConsejo;
}

/**
 * Actualiza los datos generales de un proyecto.
 */
export async function actualizarProyecto(
  id: string,
  datos: {
    name?: string;
    context?: string;
    status?: "borrador" | "cerrado";
  }
): Promise<ProyectoConsejo> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data: proyecto, error } = await sb
    .from("council_projects")
    .update({
      ...datos,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/consejo");
  revalidatePath(`/consejo/${id}`);
  return proyecto as ProyectoConsejo;
}

/**
 * Elimina un proyecto por completo (borrado en cascada en Supabase).
 */
export async function eliminarProyecto(id: string): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { error } = await sb.from("council_projects").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/consejo");
}

/**
 * Obtiene todas las alternativas de un proyecto.
 */
export async function obtenerAlternativas(
  projectId: string
): Promise<AlternativaConsejo[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("council_alternatives")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AlternativaConsejo[];
}

/**
 * Actualiza el estado o notas de una alternativa.
 */
export async function actualizarAlternativa(
  id: string,
  datos: {
    admin_notes?: string;
    status?: "Pendiente revisión" | "Descartada" | "Seleccionada";
  }
): Promise<AlternativaConsejo> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // 1. Obtener la alternativa primero para saber el project_id y revalidar la caché
  const { data: existing } = await sb
    .from("council_alternatives")
    .select("project_id")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await sb
    .from("council_alternatives")
    .update(datos)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (existing?.project_id) {
    revalidatePath(`/consejo/${existing.project_id}`);
  }
  return data as AlternativaConsejo;
}

/**
 * Guarda los cambios realizados en los consejeros de un proyecto.
 */
export async function guardarAsesores(
  projectId: string,
  asesores: Array<{
    id: string;
    enabled: boolean;
    prompt: string;
  }>
): Promise<void> {
  await requireAdministrador();
  const sb = supabaseServidor();

  // Actualizar cada asesor
  const promesas = asesores.map((a) =>
    sb
      .from("council_advisors")
      .update({
        enabled: a.enabled,
        prompt: a.prompt,
      })
      .eq("id", a.id)
      .eq("project_id", projectId)
  );

  const resultados = await Promise.all(promesas);
  const error = resultados.find((r) => r.error);
  if (error) throw new Error(error.error?.message || "Error al actualizar asesores.");

  revalidatePath(`/consejo/${projectId}`);
}
