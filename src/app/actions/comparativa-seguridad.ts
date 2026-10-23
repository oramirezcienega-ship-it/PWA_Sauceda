"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { variantesTelefono } from "@/lib/telefono";
import { armarComboSeguridad } from "@/lib/combo-seguridad";
import { crearCotizacion } from "@/app/actions/cotizaciones";
import { buscarFamilia, buscarProducto, cargarFamiliasSeguridad, MAX_OPCIONES_COMPARATIVA } from "@/lib/ia/catalogo-seguridad";
import { generarImagenComparativaSeguridad } from "@/lib/ia/imagen-comparativa-seguridad";

export interface FamiliaSeguridadResumen {
  clave: string;
  nombre: string;
  productos: { id: string; nombre: string; precio: number; fotos: { url: string; titulo: string }[] }[];
}

/** Familias de seguridad con productos activos y con precio de venta (para el cotizador del chat). */
export async function listarFamiliasSeguridad(): Promise<FamiliaSeguridadResumen[]> {
  await requireAdmin();
  const familias = await cargarFamiliasSeguridad(supabaseServidor());
  return familias.map((f) => ({
    clave: f.clave,
    nombre: f.nombre,
    productos: f.productos.slice(0, MAX_OPCIONES_COMPARATIVA).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      fotos: p.fotos.map((x) => ({ url: x.url, titulo: x.titulo || "" })),
    })),
  }));
}

/** PNG (base64) de la comparativa de una familia, listo para previsualizar y enviar al chat. */
export async function generarComparativaSeguridad(clave: string): Promise<{ ok: boolean; base64?: string; nombre?: string; error?: string }> {
  await requireAdmin();
  try {
    const familia = buscarFamilia(await cargarFamiliasSeguridad(supabaseServidor()), clave);
    if (!familia) return { ok: false, error: "Esa familia no tiene productos activos con precio de venta." };
    const png = await generarImagenComparativaSeguridad(familia);
    return { ok: true, base64: png.toString("base64"), nombre: familia.nombre };
  } catch (err: any) {
    console.error("[Seguridad] Error al generar la comparativa:", err);
    return { ok: false, error: err?.message || "No se pudo generar la imagen." };
  }
}

/**
 * Crea la cotización modular del combo: los productos elegidos como partida fija y el resto
 * como opcionales. Queda pendiente de aprobación para revisarla y enviarla desde Construcción.
 */
export async function crearComboSeguridad(
  telefono: string,
  d: { fijos: string[]; opcionales: string[] }
): Promise<{ ok: boolean; cotizacionId?: string; error?: string }> {
  await requireAdmin();
  try {
    const sb = supabaseServidor();
    const familias = await cargarFamiliasSeguridad(sb);
    const fijos = d.fijos.map((id) => buscarProducto(familias, id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const opcionales = d.opcionales
      .filter((id) => !d.fijos.includes(id))
      .map((id) => buscarProducto(familias, id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (fijos.length === 0) return { ok: false, error: "Elige al menos un producto que el cliente ya escogió." };

    // Cliente de la conversación: prospecto (obligatorio para la cotización) y su expediente
    const v = variantesTelefono(telefono);
    const { data: exps } = await sb
      .from("expedientes")
      .select("id, prospecto_id")
      .in("telefono", v)
      .order("created_at", { ascending: false })
      .limit(1);
    let prospectoId: string | null = exps?.[0]?.prospecto_id ?? null;
    if (!prospectoId) {
      const { data: pros } = await sb.from("prospectos").select("id").in("telefono", v).order("created_at", { ascending: false }).limit(1);
      prospectoId = pros?.[0]?.id ?? null;
    }
    if (!prospectoId) return { ok: false, error: "Este chat todavía no tiene prospecto registrado; créalo primero desde el CRM." };

    const datosModulares = armarComboSeguridad(fijos, opcionales);
    const cot = await crearCotizacion({
      prospectoId,
      expedienteId: exps?.[0]?.id ?? null,
      servicioTipo: "otro",
      requiereVisita: false,
      notasInternas: `Combo de seguridad armado desde el chat. Fijo: ${fijos.map((p) => p.id).join(", ")}. Opcionales: ${opcionales.map((p) => p.id).join(", ") || "ninguno"}.`,
    });

    const { error } = await sb
      .from("cotizaciones")
      .update({
        modalidad: "modular",
        datos_modulares: datosModulares,
        precio_final: datosModulares.estructuraBase.precio,
        costo_estimado: datosModulares.estructuraBase.costoFijo ?? 0,
        estatus: "pendiente_aprobacion",
        alcances: [...fijos, ...opcionales].map((p) => `${p.nombre}${opcionales.includes(p) ? " (opcional)" : ""}`).join("\n"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cot.id);
    if (error) return { ok: false, error: error.message };

    if (exps?.[0]?.id) {
      await registrarActividad(sb, {
        expedienteId: exps[0].id,
        tipo: "construccion",
        titulo: `Combo de seguridad en cotización (${cot.id})`,
        detalle: `Incluido: ${fijos.map((p) => p.nombre).join(" + ")}. Opcionales: ${opcionales.map((p) => p.nombre).join(", ") || "ninguno"}.`,
      });
    }
    return { ok: true, cotizacionId: cot.id };
  } catch (err: any) {
    console.error("[Seguridad] Error al crear el combo:", err);
    return { ok: false, error: err?.message || "No se pudo crear la cotización." };
  }
}
