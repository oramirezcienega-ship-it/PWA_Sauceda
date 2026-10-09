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
import {
  rankearInmuebles,
  type OrigenInmueble,
  type PerfilMatch,
} from "@/lib/asesoria/match";
import { firmarFotos, prepararSubidaFoto, rondaActual } from "@/lib/asesoria/servidor";
import {
  filaInmuebleDesdeFormulario,
  type DatosInmuebleRapido,
} from "@/lib/asesoria/inmueble-form";
import {
  ESTATUS_INMUEBLE,
  MAX_PUBLICADAS_POR_RONDA,
  descripcionAutomatica,
  filaAInmueble,
  type EstatusInmueble,
  type EstatusPropuesta,
  type Inmueble,
} from "@/lib/asesoria/inmuebles";

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

// ============================================================================
// Fase 2: inventario de inmuebles, inventario propio y sugerencias (match)
// ============================================================================

const SELECT_INMUEBLE = "*, aliado:aliado_id(nombre)";

type Sb = ReturnType<typeof supabaseServidor>;

export interface FiltrosInventario {
  zona?: string;
  precioMin?: number | null;
  precioMax?: number | null;
  origen?: OrigenInmueble | "";
  estatus?: EstatusInmueble | "";
}

/** Lista el inventario con filtros (menú Inventario). */
export async function listarInmuebles(filtros: FiltrosInventario = {}): Promise<Inmueble[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  let q = sb.from("inmuebles").select(SELECT_INMUEBLE).order("created_at", { ascending: false }).limit(500);
  if (filtros.origen) q = q.eq("origen", filtros.origen);
  if (filtros.estatus) q = q.eq("estatus", filtros.estatus);
  if (filtros.precioMin) q = q.gte("precio", filtros.precioMin);
  if (filtros.precioMax) q = q.lte("precio", filtros.precioMax);
  const zona = (filtros.zona ?? "").trim().replace(/[%,()]/g, " ");
  if (zona) q = q.or(`zona.ilike.%${zona}%,fraccionamiento.ilike.%${zona}%,colonia.ilike.%${zona}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return firmarFotos(sb, (data ?? []).map(filaAInmueble));
}

/** Detalle de un inmueble con todas sus fotos firmadas. */
export async function obtenerInmueble(id: string): Promise<Inmueble | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb.from("inmuebles").select(SELECT_INMUEBLE).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [i] = await firmarFotos(sb, [filaAInmueble(data)]);
  return i;
}

/** URL firmada para que el navegador suba una foto directo al bucket `inmuebles`. */
export async function prepararSubidaFotoInmueble(
  nombre: string,
): Promise<{ ok: boolean; ruta?: string; token?: string; error?: string }> {
  await requireAdmin();
  return prepararSubidaFoto(nombre, "internas");
}

/** "Agregar desde portal": inmueble capturado a mano por SAUCEDA (queda disponible). */
export async function crearInmueblePortal(
  datos: DatosInmuebleRapido,
): Promise<{ ok: true; inmueble: Inmueble } | { ok: false; mensaje: string }> {
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const r = filaInmuebleDesdeFormulario(datos);
    if (!r.ok) return r;
    if (!r.fila.url_fuente) return { ok: false, mensaje: "Pega la URL de la publicación en el portal." };
    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("inmuebles")
      .insert({
        ...r.fila,
        origen: "portal",
        estatus: "disponible",
        validado_por: usuario?.id ?? null,
        validado_en: new Date().toISOString(),
      })
      .select(SELECT_INMUEBLE)
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/inventario");
    const [i] = await firmarFotos(sb, [filaAInmueble(data)]);
    return { ok: true, inmueble: i };
  } catch (err) {
    console.error("[crearInmueblePortal]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo guardar el inmueble." };
  }
}

/** Aprobar (→ disponible) o descartar un inmueble; también apartado / vendido. */
export async function cambiarEstatusInmueble(
  id: string,
  estatus: EstatusInmueble,
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    if (!(ESTATUS_INMUEBLE as readonly string[]).includes(estatus)) return { ok: false, mensaje: "Estatus inválido." };
    const usuario = await usuarioActual();
    const payload: Record<string, any> = { estatus };
    if (estatus === "disponible") {
      payload.validado_por = usuario?.id ?? null;
      payload.validado_en = new Date().toISOString();
    }
    const sb = supabaseServidor();
    const { error } = await sb.from("inmuebles").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/inventario");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo actualizar." };
  }
}

// ---------------- Inventario propio ----------------

const TIPOS_VENDEDOR = ["promocion_venta", "traspaso_compra"];

/** Expediente vendedor + su ficha de promoción → columnas de `inmuebles` (sin estatus). */
async function filaInventarioPropio(sb: Sb, exp: Record<string, any>, promo: Record<string, any>) {
  const { data: fotos } = await sb
    .from("fotos_expedientes")
    .select("url")
    .eq("expediente_id", exp.id)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  const direccion = [promo.calle, promo.numero_exterior].filter(Boolean).join(" ").trim();
  const colonia = promo.colonia || null;
  const fraccionamiento = exp.fraccionamiento || null;
  const datos = {
    fraccionamiento,
    zona: fraccionamiento || colonia,
    recamaras: promo.num_recamaras ?? null,
    banos: promo.num_banos != null ? Number(promo.num_banos) : null,
    metrosConstruccion: promo.metros_construccion != null ? Number(promo.metros_construccion) : null,
    metrosTerreno: promo.metros_terreno != null ? Number(promo.metros_terreno) : null,
  };
  return {
    origen: "propio",
    expediente_origen_id: exp.id,
    precio: Number(exp.valor_estimado),
    zona: datos.zona,
    fraccionamiento,
    colonia,
    ciudad: promo.ciudad || "León",
    direccion_privada:
      [direccion, colonia, exp.direccion_propiedad && !direccion ? exp.direccion_propiedad : null]
        .filter(Boolean)
        .join(", ") || null,
    metros_construccion: promo.metros_construccion,
    metros_terreno: promo.metros_terreno,
    recamaras: promo.num_recamaras,
    banos: promo.num_banos,
    anio_construccion: promo.anio_construccion,
    estado_conservacion: promo.estado_conservacion,
    tiene_escritura: promo.tiene_escritura,
    tiene_adeudos: promo.tiene_adeudos,
    tiene_litigios: promo.tiene_litigios === true || exp.hay_litigios === true ? true : promo.tiene_litigios,
    fotos: (fotos ?? []).map((f: any) => f.url).filter(Boolean),
    descripcion_publica: descripcionAutomatica(datos),
  };
}

export interface ResultadoSincronizacion {
  ok: boolean;
  creados: number;
  actualizados: number;
  omitidos: { expedienteId: string; motivo: string }[];
  mensaje?: string;
}

/**
 * Convierte los expedientes vendedores (promocion_venta / traspaso_compra) con
 * ficha en `promociones_expedientes` en inmuebles `origen = 'propio'`.
 * Los nuevos quedan `por_validar` (o `disponible` si se publican desde el
 * expediente); los existentes solo actualizan sus datos y conservan su estatus.
 */
export async function sincronizarInventarioPropio(
  opciones: { expedienteId?: string; publicar?: boolean } = {},
): Promise<ResultadoSincronizacion> {
  const resultado: ResultadoSincronizacion = { ok: true, creados: 0, actualizados: 0, omitidos: [] };
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const sb = supabaseServidor();

    let q = sb
      .from("expedientes")
      .select("id, tipo_negocio, etapa, fraccionamiento, valor_estimado, direccion_propiedad, hay_litigios")
      .in("tipo_negocio", TIPOS_VENDEDOR);
    if (opciones.expedienteId) q = q.eq("id", opciones.expedienteId);
    const { data: exps, error } = await q;
    if (error) throw new Error(error.message);
    if (opciones.expedienteId && (!exps || exps.length === 0)) {
      return { ...resultado, ok: false, mensaje: "Solo los expedientes de Promoción de venta o Traspaso/Compra se publican al inventario." };
    }

    const ids = (exps ?? []).map((e) => e.id);
    if (ids.length === 0) return resultado;
    const [{ data: promos }, { data: existentes }] = await Promise.all([
      sb.from("promociones_expedientes").select("*").in("expediente_id", ids),
      sb.from("inmuebles").select("id, expediente_origen_id, estatus").in("expediente_origen_id", ids),
    ]);
    const promoPorExp = new Map((promos ?? []).map((p: any) => [p.expediente_id, p]));
    const inmueblePorExp = new Map((existentes ?? []).map((i: any) => [i.expediente_origen_id, i]));

    for (const exp of exps ?? []) {
      const promo = promoPorExp.get(exp.id);
      if (!promo) {
        resultado.omitidos.push({ expedienteId: exp.id, motivo: "Sin ficha de la propiedad (promoción)" });
        continue;
      }
      if (!(Number(exp.valor_estimado) > 0)) {
        resultado.omitidos.push({ expedienteId: exp.id, motivo: "Sin precio (valor estimado)" });
        continue;
      }
      const existente = inmueblePorExp.get(exp.id);
      if (!existente && exp.etapa === "perdido" && !opciones.expedienteId) {
        resultado.omitidos.push({ expedienteId: exp.id, motivo: "Expediente perdido" });
        continue;
      }
      const fila: Record<string, any> = await filaInventarioPropio(sb, exp, promo);
      if (opciones.publicar) {
        fila.estatus = "disponible";
        fila.validado_por = usuario?.id ?? null;
        fila.validado_en = new Date().toISOString();
      }
      if (existente) {
        // Si SAUCEDA ya cerró o descartó el inmueble, no se reabre al sincronizar en lote.
        if (!opciones.publicar) delete fila.estatus;
        const { error: e } = await sb.from("inmuebles").update(fila).eq("id", existente.id);
        if (e) throw new Error(e.message);
        resultado.actualizados++;
      } else {
        if (!fila.estatus) fila.estatus = "por_validar";
        const { error: e } = await sb.from("inmuebles").insert(fila);
        if (e) throw new Error(e.message);
        resultado.creados++;
      }
      if (opciones.expedienteId) {
        await registrarActividad(sb, {
          expedienteId: exp.id,
          tipo: "sistema",
          titulo: "🏘️ Publicado al inventario",
          detalle: existente ? "Se actualizaron los datos del inmueble en el inventario." : "La propiedad ya forma parte del inventario propio.",
        });
      }
    }
    revalidatePath("/inventario");
    return resultado;
  } catch (err) {
    console.error("[sincronizarInventarioPropio]", err);
    return { ...resultado, ok: false, mensaje: err instanceof Error ? err.message : "No se pudo sincronizar." };
  }
}

/** Botón "Publicar al inventario" en el expediente del vendedor. */
export async function publicarAlInventario(expedienteId: string): Promise<ResultadoSincronizacion> {
  return sincronizarInventarioPropio({ expedienteId, publicar: true });
}

/** Inmueble ligado a un expediente vendedor (para mostrar su estado en el botón). */
export async function obtenerInmuebleDeExpediente(expedienteId: string): Promise<{ id: string; folio: string; estatus: EstatusInmueble } | null> {
  await requireAdmin();
  const { data } = await supabaseServidor()
    .from("inmuebles")
    .select("id, folio, estatus")
    .eq("expediente_origen_id", expedienteId)
    .maybeSingle();
  return (data as any) ?? null;
}

// ---------------- Sugerencias y bandeja "Opciones" ----------------

export interface PropuestaInmueble {
  id: string;
  expedienteId: string;
  ronda: number;
  scoreMatch: number | null;
  razonesMatch: string[];
  estatus: EstatusPropuesta;
  motivoDescarte: string | null;
  comentarioCliente: string | null;
  publicadaEn: string | null;
  vistaEn: string | null;
  respondidaEn: string | null;
  createdAt: string;
  inmueble: Inmueble;
}

/** Perfil de match del expediente comprador. */
async function perfilMatchDeExpediente(sb: Sb, expedienteId: string) {
  const { data } = await sb
    .from("expedientes")
    .select(COLUMNAS_PERFIL + ", tipo_credito")
    .eq("id", expedienteId)
    .maybeSingle();
  if (!data) return null;
  const f = data as Record<string, any>;
  const p = filaAPerfil(f);
  const perfil: PerfilMatch = { ...p, tipoCredito: f.tipo_credito ?? null };
  return { fila: f, perfil };
}

/**
 * Cruza el perfil del comprador contra el inventario disponible y guarda las
 * coincidencias como propuestas `sugerida` (solo las ve SAUCEDA). No duplica
 * inmuebles ya propuestos. Completa la tarea BPM "Cruzar perfil contra
 * inventario propio" si estaba pendiente.
 */
export async function generarSugerencias(
  expedienteId: string,
): Promise<{ ok: boolean; nuevas: number; evaluados: number; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const datos = await perfilMatchDeExpediente(sb, expedienteId);
    if (!datos) return { ok: false, nuevas: 0, evaluados: 0, mensaje: "El expediente no existe." };
    if (datos.fila.tipo_negocio !== "asesoria_compra") {
      return { ok: false, nuevas: 0, evaluados: 0, mensaje: "Solo aplica a expedientes de asesoría de compra." };
    }
    if (datos.fila.ya_tiene_casa) {
      return { ok: false, nuevas: 0, evaluados: 0, mensaje: "El cliente ya tiene casa: no hay búsqueda." };
    }

    const { data: inventario, error } = await sb.from("inmuebles").select("*").eq("estatus", "disponible").limit(2000);
    if (error) throw new Error(error.message);
    const { data: yaPropuestos } = await sb.from("propuestas_inmuebles").select("inmueble_id").eq("expediente_id", expedienteId);
    const excluidos = new Set((yaPropuestos ?? []).map((p: any) => p.inmueble_id));
    // El comprador nunca recibe como opción su propia casa (si también es vendedor).
    const candidatos = (inventario ?? []).filter((i: any) => !excluidos.has(i.id) && i.expediente_origen_id !== expedienteId);

    const ranking = rankearInmuebles(datos.perfil, candidatos as any[]);
    const ronda = await rondaActual(sb, expedienteId);
    if (ranking.length > 0) {
      const { error: e } = await sb.from("propuestas_inmuebles").upsert(
        ranking.map((r) => ({
          expediente_id: expedienteId,
          inmueble_id: (r.inmueble as any).id,
          ronda,
          score_match: r.score,
          razones_match: r.razones,
          estatus: "sugerida",
        })),
        { onConflict: "expediente_id,inmueble_id", ignoreDuplicates: true },
      );
      if (e) throw new Error(e.message);
    }

    await registrarActividad(sb, {
      expedienteId,
      tipo: "sistema",
      titulo: "🏘️ Cruce contra inventario",
      detalle: `Se evaluaron ${candidatos.length} inmuebles disponibles; ${ranking.length} coinciden con el perfil.`,
    });

    // Completar el paso de sistema del flujo BPM (desbloquea "Enviar solicitud a aliados").
    const { data: tareas } = await sb
      .from("bpm_expediente_tareas")
      .select("id, estado, paso:paso_id(titulo_tarea)")
      .eq("expediente_id", expedienteId)
      .eq("estado", "pendiente");
    const tareaCruce = (tareas ?? []).find((t: any) => t.paso?.titulo_tarea === "Cruzar perfil contra inventario propio");
    if (tareaCruce) {
      const { actualizarEstadoTarea } = await import("@/app/actions/bpm");
      await actualizarEstadoTarea(tareaCruce.id, "completada");
    }

    revalidatePath(`/expediente/${expedienteId}`);
    return { ok: true, nuevas: ranking.length, evaluados: candidatos.length };
  } catch (err) {
    console.error("[generarSugerencias]", err);
    return { ok: false, nuevas: 0, evaluados: 0, mensaje: err instanceof Error ? err.message : "No se pudo generar." };
  }
}

/** Bandeja "Opciones": propuestas del expediente con su inmueble (vista interna). */
export async function listarPropuestas(expedienteId: string): Promise<PropuestaInmueble[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("propuestas_inmuebles")
    .select("*, inmueble:inmueble_id(*, aliado:aliado_id(nombre))")
    .eq("expediente_id", expedienteId)
    .order("ronda", { ascending: false })
    .order("score_match", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  const filas = (data ?? []).filter((p: any) => p.inmueble);
  const inmuebles = await firmarFotos(sb, filas.map((p: any) => filaAInmueble(p.inmueble)), true);
  return filas.map((p: any, idx: number) => ({
    id: p.id,
    expedienteId: p.expediente_id,
    ronda: p.ronda,
    scoreMatch: p.score_match != null ? Number(p.score_match) : null,
    razonesMatch: p.razones_match ?? [],
    estatus: p.estatus,
    motivoDescarte: p.motivo_descarte,
    comentarioCliente: p.comentario_cliente,
    publicadaEn: p.publicada_en,
    vistaEn: p.vista_en,
    respondidaEn: p.respondida_en,
    createdAt: p.created_at,
    inmueble: inmuebles[idx],
  }));
}

/**
 * Publica una sugerencia para que el cliente la vea en su portal. Más de 5
 * publicadas en la ronda solo genera advertencia (la UI pide confirmación).
 */
export async function publicarPropuesta(
  propuestaId: string,
): Promise<{ ok: boolean; publicadasEnRonda?: number; advertencia?: string; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: p } = await sb
      .from("propuestas_inmuebles")
      .select("id, expediente_id, inmueble_id, ronda, estatus, inmueble:inmueble_id(folio, estatus)")
      .eq("id", propuestaId)
      .maybeSingle();
    if (!p) return { ok: false, mensaje: "La propuesta no existe." };
    if (p.estatus !== "sugerida") return { ok: false, mensaje: "Solo se publican propuestas sugeridas." };
    const estatusInmueble = (p as any).inmueble?.estatus;
    if (estatusInmueble !== "disponible" && estatusInmueble !== "por_validar") {
      return { ok: false, mensaje: "El inmueble ya no está disponible." };
    }
    const { data: exp } = await sb.from("expedientes").select("asesor_id, operador_id").eq("id", p.expediente_id).maybeSingle();
    if (exp) await verificarAcceso(exp as any);

    // Casa de aliado aún sin validar: publicar = el asesor la revisó y la valida.
    if (estatusInmueble === "por_validar") {
      const usuario = await usuarioActual();
      const { error: errVal } = await sb
        .from("inmuebles")
        .update({ estatus: "disponible", validado_por: usuario?.id ?? null, validado_en: new Date().toISOString() })
        .eq("id", (p as any).inmueble_id ?? (p as any).inmueble?.id)
        .eq("estatus", "por_validar");
      if (errVal) throw new Error(errVal.message);
    }

    const { error } = await sb
      .from("propuestas_inmuebles")
      .update({ estatus: "publicada", publicada_en: new Date().toISOString() })
      .eq("id", propuestaId)
      .eq("estatus", "sugerida");
    if (error) throw new Error(error.message);

    const { count } = await sb
      .from("propuestas_inmuebles")
      .select("id", { count: "exact", head: true })
      .eq("expediente_id", p.expediente_id)
      .eq("ronda", p.ronda)
      .not("publicada_en", "is", null);
    await registrarActividad(sb, {
      expedienteId: p.expediente_id,
      tipo: "sistema",
      titulo: `📤 Opción publicada al cliente (${(p as any).inmueble?.folio ?? ""})`,
      detalle: `Ronda ${p.ronda}: ${count ?? 0} opciones publicadas.`,
    });
    revalidatePath(`/expediente/${p.expediente_id}`);
    const publicadas = count ?? 0;
    return {
      ok: true,
      publicadasEnRonda: publicadas,
      advertencia:
        publicadas > MAX_PUBLICADAS_POR_RONDA
          ? `Ya hay ${publicadas} opciones publicadas en la ronda ${p.ronda}; se recomiendan de 3 a ${MAX_PUBLICADAS_POR_RONDA}.`
          : undefined,
    };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo publicar." };
  }
}

/** El asesor descarta una sugerencia (no la verá el cliente). */
export async function descartarSugerencia(propuestaId: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { error } = await sb
      .from("propuestas_inmuebles")
      .update({ estatus: "descartada", motivo_descarte: "otro", comentario_cliente: null })
      .eq("id", propuestaId)
      .eq("estatus", "sugerida");
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo descartar." };
  }
}
