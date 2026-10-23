"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { ORIGEN_META, reclasificarCampanaMeta } from "@/features/marketing/meta-ads";

/**
 * Finanzas → Por clasificar. Cada movimiento importado afecta el P&L según una regla:
 * la primera vez se pregunta a dónde va y la respuesta se recuerda. Por ahora la
 * fuente es Meta Ads (una regla por campaña); Securo y bancos usarán la misma tabla.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ReglaCampanaMeta {
  campaignId: string;
  nombre: string;
  estado: "confirmada" | "sugerida" | "pendiente";
  accion: "clasificar" | "ignorar";
  codigoSubcuenta: string | null;
  productoNombre: string | null;
  gastoTotal: number;
  gastoMesActual: number;
  ultimoDia: string | null;
}

export async function listarReglasMeta(): Promise<ReglaCampanaMeta[]> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const [{ data: reglas, error }, { data: dias }] = await Promise.all([
    sb
      .from("reglas_clasificacion")
      .select("criterio_valor, nombre, estado, accion, codigo_subcuenta, producto_nombre")
      .eq("origen", ORIGEN_META)
      .eq("criterio_tipo", "campaign_id"),
    sb.from("meta_ads_gastos").select("campaign_id, campaign_name, gasto, fecha_inicio"),
  ]);
  if (error) throw new Error(error.message);

  const mesActual = new Date().toISOString().slice(0, 7);
  const porCampana = new Map<string, { nombre: string; total: number; mes: number; ultimo: string | null }>();
  for (const d of dias || []) {
    const c = porCampana.get(d.campaign_id) || { nombre: d.campaign_name, total: 0, mes: 0, ultimo: null };
    const gasto = Number(d.gasto || 0);
    c.total += gasto;
    if (String(d.fecha_inicio).startsWith(mesActual)) c.mes += gasto;
    if (!c.ultimo || d.fecha_inicio > c.ultimo) {
      c.ultimo = d.fecha_inicio;
      c.nombre = d.campaign_name || c.nombre;
    }
    porCampana.set(d.campaign_id, c);
  }

  return (reglas || [])
    .map((r: any) => {
      const c = porCampana.get(r.criterio_valor);
      return {
        campaignId: r.criterio_valor,
        nombre: c?.nombre || r.nombre || r.criterio_valor,
        estado: r.estado,
        accion: r.accion,
        codigoSubcuenta: r.codigo_subcuenta,
        productoNombre: r.producto_nombre,
        gastoTotal: r2(c?.total || 0),
        gastoMesActual: r2(c?.mes || 0),
        ultimoDia: c?.ultimo || null,
      };
    })
    .sort((a, b) => (b.ultimoDia || "").localeCompare(a.ultimoDia || ""));
}

/** Número de reglas por confirmar (para el aviso de la pestaña). */
export async function contarPorClasificar(): Promise<number> {
  await requireAdministrador();
  const { count } = await supabaseServidor()
    .from("reglas_clasificacion")
    .select("id", { count: "exact", head: true })
    .neq("estado", "confirmada");
  return count || 0;
}

/** Confirma o corrige a dónde afecta una campaña y recalcula sus meses en Finanzas. */
export async function guardarReglaMeta(datos: {
  campaignId: string;
  accion: "clasificar" | "ignorar";
  codigoSubcuenta: string | null;
  productoNombre: string | null;
}): Promise<{ ok: boolean; meses?: string[]; error?: string }> {
  try {
    await requireAdministrador();
    if (datos.accion === "clasificar" && !datos.codigoSubcuenta) {
      return { ok: false, error: "Elige la subcuenta a la que afecta la campaña." };
    }
    const usuario = await usuarioActual();
    const sb = supabaseServidor();
    const ahora = new Date().toISOString();
    const { error } = await sb
      .from("reglas_clasificacion")
      .update({
        estado: "confirmada",
        accion: datos.accion,
        codigo_subcuenta: datos.accion === "clasificar" ? datos.codigoSubcuenta : null,
        producto_nombre: datos.accion === "clasificar" ? (datos.productoNombre || "").trim() || null : null,
        confirmada_por: usuario?.id || null,
        confirmada_at: ahora,
        updated_at: ahora,
      })
      .eq("origen", ORIGEN_META)
      .eq("criterio_tipo", "campaign_id")
      .eq("criterio_valor", datos.campaignId);
    if (error) return { ok: false, error: error.message };

    const meses = await reclasificarCampanaMeta(sb, datos.campaignId);
    revalidatePath("/finanzas");
    return { ok: true, meses };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo guardar la clasificación." };
  }
}
