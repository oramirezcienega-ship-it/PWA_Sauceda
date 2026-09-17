"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import {
  aEmpresa,
  aFilaEmpresa,
  aProspecto,
  aExpediente,
  type FilaEmpresa,
  type FilaProspecto,
  type FilaExpediente,
} from "@/lib/supabase/mapeo";
import { registrarActividad } from "@/lib/actividades";
import type { DatosEmpresa, Empresa, Prospecto, Expediente } from "@/lib/types";

export interface FiltrosEmpresas {
  search?: string;
  industry?: string;
  ownerId?: string;
}

/**
 * Lista todas las empresas con filtros opcionales (búsqueda, industria, propietario)
 * y calcula dinámicamente sus métricas de prospectos y negocios asociados.
 */
export async function listarEmpresas(filtros?: FiltrosEmpresas): Promise<Empresa[]> {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);

  const sb = supabaseServidor();

  // 1. Obtener empresas
  let query = sb
    .from("empresas")
    .select("*, perfiles:owner_id(nombre), parent:parent_id(name)")
    .order("name", { ascending: true });

  if (rol === "asesor") {
    query = query.eq("owner_id", usuario.id);
  } else if (filtros?.ownerId && filtros.ownerId !== "todos") {
    query = query.eq("owner_id", filtros.ownerId);
  }

  if (filtros?.industry && filtros.industry !== "todas") {
    query = query.eq("industry", filtros.industry);
  }

  if (filtros?.search && filtros.search.trim()) {
    query = query.ilike("name", `%${filtros.search.trim()}%`);
  }

  const { data: empresasData, error: errEmpresas } = await query;
  if (errEmpresas) {
    // Si la tabla aún no se ha creado en la base de datos, retornamos array vacío
    console.warn("Aviso al consultar empresas:", errEmpresas.message);
    return [];
  }

  if (!empresasData || empresasData.length === 0) {
    return [];
  }

  const empresasIds = empresasData.map((e) => e.id);

  // 2. Obtener conteo de sucursales (hijas con parent_id)
  let sucursalesPorEmpresa: Record<string, number> = {};
  try {
    const { data: sucData } = await sb
      .from("empresas")
      .select("parent_id")
      .not("parent_id", "is", null)
      .in("parent_id", empresasIds);

    if (sucData) {
      sucData.forEach((s) => {
        if (s.parent_id) {
          sucursalesPorEmpresa[s.parent_id] = (sucursalesPorEmpresa[s.parent_id] || 0) + 1;
        }
      });
    }
  } catch {}

  // 3. Obtener métricas agregadas de prospectos por empresa
  let prospectosPorEmpresa: Record<string, number> = {};
  try {
    const { data: prosData } = await sb
      .from("prospectos")
      .select("empresa_id")
      .in("empresa_id", empresasIds);

    if (prosData) {
      prosData.forEach((p) => {
        if (p.empresa_id) {
          prospectosPorEmpresa[p.empresa_id] = (prospectosPorEmpresa[p.empresa_id] || 0) + 1;
        }
      });
    }
  } catch (e) {
    console.warn("No se pudieron calcular métricas de prospectos:", e);
  }

  // 4. Obtener métricas agregadas de negocios por empresa
  let negociosPorEmpresa: Record<string, { count: number; totalValor: number }> = {};
  try {
    const { data: expsData } = await sb
      .from("expedientes")
      .select("empresa_id, valor_estimado")
      .in("empresa_id", empresasIds);

    if (expsData) {
      expsData.forEach((exp) => {
        if (exp.empresa_id) {
          const actual = negociosPorEmpresa[exp.empresa_id] || { count: 0, totalValor: 0 };
          negociosPorEmpresa[exp.empresa_id] = {
            count: actual.count + 1,
            totalValor: actual.totalValor + (exp.valor_estimado || 0),
          };
        }
      });
    }
  } catch (e) {
    console.warn("No se pudieron calcular métricas de expedientes:", e);
  }

  // 5. Ensamblar modelo de dominio
  return (empresasData as FilaEmpresa[]).map((f) => {
    const pCount = prospectosPorEmpresa[f.id] || 0;
    const neg = negociosPorEmpresa[f.id] || { count: 0, totalValor: 0 };
    return aEmpresa(f, {
      sucursalesCount: sucursalesPorEmpresa[f.id] || 0,
      prospectosCount: pCount,
      negociosCount: neg.count,
      valorTotalNegocios: neg.totalValor,
    });
  });
}

/**
 * Obtiene el detalle completo de una Empresa con sus sucursales, prospectos (contactos)
 * y expedientes (deals) relacionados para la vista 360°.
 */
export async function obtenerEmpresa(id: string): Promise<{
  empresa: Empresa;
  prospectos: Prospecto[];
  negocios: Expediente[];
  sucursales: Empresa[];
} | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: empresaData, error: errEmpresa } = await sb
    .from("empresas")
    .select("*, perfiles:owner_id(nombre), parent:parent_id(name)")
    .eq("id", id)
    .maybeSingle();

  if (errEmpresa || !empresaData) {
    return null;
  }

  // Sucursales vinculadas a esta empresa (hijas con parent_id = id)
  let sucursales: Empresa[] = [];
  try {
    const { data: sucData } = await sb
      .from("empresas")
      .select("*, perfiles:owner_id(nombre)")
      .eq("parent_id", id)
      .order("name", { ascending: true });

    if (sucData) {
      sucursales = (sucData as FilaEmpresa[]).map((s) => aEmpresa(s));
    }
  } catch (e) {
    console.warn("No se pudieron cargar sucursales de la empresa:", e);
  }

  // Prospectos vinculados a esta empresa
  let prospectos: Prospecto[] = [];
  try {
    const { data: prosData } = await sb
      .from("prospectos")
      .select("*, asesor:asesor_id(nombre), operador:operador_id(nombre), expedientes:expedientes(id, tipo_negocio, etapa)")
      .eq("empresa_id", id)
      .order("created_at", { ascending: false });

    if (prosData) {
      prospectos = (prosData as FilaProspecto[]).map(aProspecto);
    }
  } catch (e) {
    console.warn("No se pudieron cargar prospectos de la empresa:", e);
  }

  // Negocios vinculados a esta empresa (con datos del prospecto relacionado)
  let negocios: Expediente[] = [];
  try {
    const { data: expsData } = await sb
      .from("expedientes")
      .select("*, asesor:asesor_id(nombre), operador:operador_id(nombre), prospectos:prospecto_id(nombre, primer_apellido, segundo_apellido, correo, direccion)")
      .eq("empresa_id", id)
      .order("created_at", { ascending: false });

    if (expsData) {
      negocios = (expsData as FilaExpediente[]).map(aExpediente);
    }
  } catch (e) {
    console.warn("No se pudieron cargar negocios de la empresa:", e);
  }

  const totalValor = negocios.reduce((acc, curr) => acc + (curr.valorEstimado || 0), 0);

  const empresa = aEmpresa(empresaData as FilaEmpresa, {
    sucursalesCount: sucursales.length,
    prospectosCount: prospectos.length,
    negociosCount: negocios.length,
    valorTotalNegocios: totalValor,
  });

  return { empresa, prospectos, negocios, sucursales };
}

/**
 * Crea una nueva empresa y registra la actividad en bitácora.
 */
export async function crearEmpresa(datos: DatosEmpresa): Promise<Empresa> {
  await requireAdmin();
  if (!datos.name || !datos.name.trim()) {
    throw new Error("El nombre de la empresa es obligatorio.");
  }

  const sb = supabaseServidor();
  const fila = aFilaEmpresa(datos);

  const { data, error } = await sb
    .from("empresas")
    .insert(fila)
    .select("*, perfiles:owner_id(nombre)")
    .single();

  if (error) {
    throw new Error(`Error al crear empresa: ${error.message}`);
  }

  const nueva = aEmpresa(data as FilaEmpresa);

  // Registrar actividad
  await registrarActividad(sb, {
    empresaId: nueva.id,
    tipo: "creacion",
    titulo: `Empresa ${nueva.name} creada en el CRM`,
    detalle: `Industria: ${nueva.industry || "No especificada"}. Propietario: ${nueva.ownerNombre || "Sin asignar"}.`,
  });

  return nueva;
}

/**
 * Actualiza los campos de una empresa existente.
 */
export async function actualizarEmpresa(
  id: string,
  datos: Partial<DatosEmpresa>
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const camposActualizar: Record<string, any> = {};
  if (datos.name !== undefined) camposActualizar.name = datos.name.trim();
  if (datos.industry !== undefined) camposActualizar.industry = datos.industry.trim();
  if (datos.website !== undefined) camposActualizar.website = datos.website.trim();
  if (datos.phone !== undefined) camposActualizar.phone = datos.phone.trim();
  if (datos.address !== undefined) camposActualizar.address = datos.address.trim();
  if (datos.billingAddress !== undefined) camposActualizar.billing_address = datos.billingAddress.trim();
  if (datos.ownerId !== undefined) camposActualizar.owner_id = datos.ownerId || null;

  const { error } = await sb
    .from("empresas")
    .update(camposActualizar)
    .eq("id", id);

  if (error) {
    throw new Error(`Error al actualizar empresa: ${error.message}`);
  }
}

/**
 * Elimina una empresa.
 * Las claves foráneas en prospectos y expedientes son ON DELETE SET NULL,
 * por lo que no se borran los contactos ni los negocios.
 */
export async function eliminarEmpresa(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb.from("empresas").delete().eq("id", id);
  if (error) {
    throw new Error(`Error al eliminar empresa: ${error.message}`);
  }
}

/**
 * Asocia o desasocia un prospecto a una empresa.
 */
export async function asociarProspectoAEmpresa(
  prospectoId: string,
  empresaId: string | null
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("prospectos")
    .update({ empresa_id: empresaId })
    .eq("id", prospectoId);

  if (error) {
    throw new Error(`Error al vincular prospecto: ${error.message}`);
  }

  if (empresaId) {
    await registrarActividad(sb, {
      empresaId,
      prospectoId,
      tipo: "nota",
      titulo: "Contacto vinculado a la empresa",
      detalle: `El prospecto ${prospectoId} fue asociado a esta cuenta corporativa.`,
    });
  }
}

/**
 * Asocia o desasocia un negocio (expediente) a una empresa.
 */
export async function asociarNegocioAEmpresa(
  expedienteId: string,
  empresaId: string | null
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("expedientes")
    .update({ empresa_id: empresaId })
    .eq("id", expedienteId);

  if (error) {
    throw new Error(`Error al vincular negocio: ${error.message}`);
  }

  if (empresaId) {
    await registrarActividad(sb, {
      empresaId,
      expedienteId,
      tipo: "nota",
      titulo: "Negocio (Deal) vinculado a la empresa",
      detalle: `El negocio ${expedienteId} fue asociado a esta cuenta corporativa.`,
    });
  }
}

/**
 * Lista empresas mínima para desplegables y modales de selección rápida.
 */
export async function listarEmpresasMin(excludeId?: string): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  try {
    let query = sb
      .from("empresas")
      .select("id, name")
      .order("name", { ascending: true });

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query;

    if (error || !data) return [];
    return data.map((d) => ({ id: d.id, name: d.name }));
  } catch {
    return [];
  }
}

/**
 * Lista prospectos que NO están vinculados a esta empresa para poder seleccionarlos y asociarlos.
 */
export async function listarProspectosDisponibles(
  empresaId: string
): Promise<{ id: string; nombre: string; telefono: string }[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido, telefono, empresa_id")
      .or(`empresa_id.is.null,empresa_id.neq.${empresaId}`)
      .order("nombre", { ascending: true })
      .limit(50);

    if (error || !data) return [];
    return data.map((p) => ({
      id: p.id,
      nombre: [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" "),
      telefono: p.telefono || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Lista negocios (expedientes) que NO están vinculados a esta empresa para poder asociarlos.
 */
export async function listarNegociosDisponibles(
  empresaId: string
): Promise<{ id: string; cliente: string; fraccionamiento: string; etapa: string }[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, fraccionamiento, etapa, empresa_id")
      .or(`empresa_id.is.null,empresa_id.neq.${empresaId}`)
      .order("id", { ascending: false })
      .limit(50);

    if (error || !data) return [];
    return data.map((e) => ({
      id: e.id,
      cliente: [e.cliente, e.primer_apellido].filter(Boolean).join(" "),
      fraccionamiento: e.fraccionamiento || "",
      etapa: e.etapa || "",
    }));
  } catch {
    return [];
  }
}
