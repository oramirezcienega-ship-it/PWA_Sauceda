"use server";

/**
 * Server actions de la asesoría y acompañamiento al comprador de vivienda
 * (`tipo_negocio = 'asesoria_compra'`).
 *
 * Fase 1: perfil de búsqueda y compuerta de precalificación.
 */

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { formatoPesos } from "@/lib/formato";
import { validarCompuertaEtapa, type ResultadoCompuerta } from "@/lib/asesoria/compuerta";
import {
  normalizarPerfil,
  perfilAFila,
  filaAPerfil,
  poderDeCompra,
  type EntradaPerfil,
  type PerfilBusqueda,
} from "@/lib/asesoria/perfil";

const COLUMNAS_PERFIL =
  "id, tipo_negocio, asesor_id, operador_id, etapa, busqueda_zonas, busqueda_precio_min, busqueda_precio_max, " +
  "monto_credito_precalificado, monto_ahorro_propio, busqueda_recamaras_min, busqueda_requisitos, " +
  "precalificacion_fecha, precalificacion_fuente, ya_tiene_casa";

/** Asesor y operaciones solo pueden tocar sus propios expedientes (misma regla que `actualizarExpediente`). */
async function verificarAcceso(exp: { asesor_id: string | null; operador_id: string | null }) {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  if (rol === "asesor" && exp.asesor_id !== usuario.id) throw new Error("No estás autorizado para modificar este expediente.");
  if (rol === "operaciones" && exp.operador_id !== usuario.id) throw new Error("No estás autorizado para modificar este expediente.");
}

/** Lee el perfil de búsqueda del expediente. */
export async function obtenerPerfilBusqueda(expedienteId: string): Promise<PerfilBusqueda | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb.from("expedientes").select(COLUMNAS_PERFIL).eq("id", expedienteId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? filaAPerfil(data as Record<string, any>) : null;
}

export type ResultadoGuardarPerfil =
  | { ok: true; perfil: PerfilBusqueda }
  | { ok: false; mensaje: string };

/**
 * Guarda el perfil de búsqueda. Si cambia "ya tiene casa", ajusta las tareas
 * BPM (agrega o cancela las de búsqueda y negociación). No lanza: devuelve el
 * error como dato para mostrarlo en la tarjeta.
 */
export async function guardarPerfilBusqueda(
  expedienteId: string,
  entrada: EntradaPerfil,
): Promise<ResultadoGuardarPerfil> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: antes, error: errAntes } = await sb
      .from("expedientes")
      .select(COLUMNAS_PERFIL)
      .eq("id", expedienteId)
      .maybeSingle();
    if (errAntes) throw new Error(errAntes.message);
    if (!antes) return { ok: false, mensaje: "El expediente no existe." };
    const filaAntes = antes as Record<string, any>;
    await verificarAcceso(filaAntes as any);

    const r = normalizarPerfil(entrada);
    if (!r.ok) return { ok: false, mensaje: r.errores.join(" ") };

    // Con el cliente ya en búsqueda o negociación, el perfil no puede quedar
    // sin precalificación ni zonas (sería saltarse la compuerta).
    if (filaAntes.tipo_negocio === "asesoria_compra") {
      const compuerta = validarCompuertaEtapa(
        {
          tipoNegocio: filaAntes.tipo_negocio,
          montoCreditoPrecalificado: r.perfil.montoCreditoPrecalificado,
          busquedaZonas: r.perfil.busquedaZonas,
          yaTieneCasa: r.perfil.yaTieneCasa,
        },
        filaAntes.etapa,
      );
      if (!compuerta.ok) return { ok: false, mensaje: compuerta.mensaje };
    }

    const { error } = await sb
      .from("expedientes")
      .update({ ...perfilAFila(r.perfil), ultimo_movimiento: new Date().toISOString().slice(0, 10) })
      .eq("id", expedienteId);
    if (error) throw new Error(error.message);

    const p = r.perfil;
    const detalle = [
      p.montoCreditoPrecalificado !== null ? `Crédito precalificado ${formatoPesos(p.montoCreditoPrecalificado)}` : null,
      p.montoAhorroPropio !== null ? `ahorro ${formatoPesos(p.montoAhorroPropio)}` : null,
      `poder de compra ${formatoPesos(poderDeCompra(p))}`,
      p.busquedaZonas.length > 0 ? `zonas: ${p.busquedaZonas.join(", ")}` : null,
      p.busquedaPrecioMin !== null || p.busquedaPrecioMax !== null
        ? `rango ${p.busquedaPrecioMin !== null ? formatoPesos(p.busquedaPrecioMin) : "—"} a ${p.busquedaPrecioMax !== null ? formatoPesos(p.busquedaPrecioMax) : "—"}`
        : null,
      p.busquedaRecamarasMin !== null ? `${p.busquedaRecamarasMin}+ recámaras` : null,
      p.yaTieneCasa ? "ya tiene casa" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    await registrarActividad(sb, {
      expedienteId,
      tipo: "sistema",
      titulo: "🔎 Perfil de búsqueda actualizado",
      detalle,
    });

    if (Boolean(filaAntes.ya_tiene_casa) !== p.yaTieneCasa) {
      const { reevaluarCondicionesBpm } = await import("@/app/actions/bpm");
      await reevaluarCondicionesBpm(expedienteId);
    }

    revalidatePath(`/expediente/${expedienteId}`);
    return { ok: true, perfil: p };
  } catch (err) {
    console.error("[guardarPerfilBusqueda]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo guardar el perfil." };
  }
}

/**
 * Valida la compuerta antes de mover de etapa (para avisar en la UI).
 * La validación definitiva vive en `moverEtapa`, que lanza si no se cumple.
 */
export async function validarCambioEtapa(expedienteId: string, etapa: string): Promise<ResultadoCompuerta> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data } = await sb.from("expedientes").select(COLUMNAS_PERFIL).eq("id", expedienteId).maybeSingle();
  if (!data) return { ok: true };
  const f = data as Record<string, any>;
  return validarCompuertaEtapa(
    {
      tipoNegocio: f.tipo_negocio,
      montoCreditoPrecalificado: f.monto_credito_precalificado,
      busquedaZonas: f.busqueda_zonas,
      yaTieneCasa: f.ya_tiene_casa,
    },
    etapa,
  );
}
