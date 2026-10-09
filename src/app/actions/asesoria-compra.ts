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
  aMonto,
  type EntradaPerfil,
  type PerfilBusqueda,
} from "@/lib/asesoria/perfil";
import {
  rankearInmuebles,
  type OrigenInmueble,
  type PerfilMatch,
} from "@/lib/asesoria/match";
import { firmarFotos, notificarAsesorTelegram, prepararSubidaFoto, rondaActual } from "@/lib/asesoria/servidor";
import { obtenerEtapasPorId, obtenerEtapasPorNegocio } from "@/lib/etapas";
import { obtenerIdAsesorGerardo } from "@/lib/asesores";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import {
  ESTATUS_RESPONDIBLES,
  ESTATUS_VISIBLES_CLIENTE,
  aOpcionCliente,
  esMotivoDescarte,
  esTokenPortalValido,
  validarFechaVisita,
  type OpcionCliente,
} from "@/lib/asesoria/portal";
import { calcularComisionAliado } from "@/lib/asesoria/convenio";
import {
  filaInmuebleDesdeFormulario,
  type DatosInmuebleRapido,
} from "@/lib/asesoria/inmueble-form";
import {
  ESTATUS_INMUEBLE,
  ETIQUETA_MOTIVO_DESCARTE,
  MAX_PUBLICADAS_POR_RONDA,
  descripcionAutomatica,
  filaAInmueble,
  type EstatusInmueble,
  type EstatusPropuesta,
  type Inmueble,
  type MotivoDescarte,
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

    // ¿Ya se avisó al cliente hace poco? (para no mandar un WhatsApp por cada opción publicada)
    const hace15 = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recientes } = await sb
      .from("propuestas_inmuebles")
      .select("id", { count: "exact", head: true })
      .eq("expediente_id", p.expediente_id)
      .gte("publicada_en", hace15);

    const { error } = await sb
      .from("propuestas_inmuebles")
      .update({ estatus: "publicada", publicada_en: new Date().toISOString() })
      .eq("id", propuestaId)
      .eq("estatus", "sugerida");
    if (error) throw new Error(error.message);

    let avisoCliente: string | undefined;
    if (!recientes) {
      const { data: cli } = await sb.from("expedientes").select("cliente, telefono, token").eq("id", p.expediente_id).maybeSingle();
      if (cli?.telefono && cli?.token) {
        const nombre = String(cli.cliente || "").trim().split(/\s+/)[0];
        const wa = await enviarWhatsAppTexto(
          cli.telefono,
          `Hola${nombre ? ` ${nombre}` : ""}, te compartimos nuevas opciones de casa que encontramos para ti 🏡. Revísalas y dinos cuáles te interesan o agenda una visita aquí: ${SITE()}/seguimiento/${cli.token}`,
        );
        avisoCliente = wa.ok
          ? "Se avisó al cliente por WhatsApp."
          : "No se pudo avisar por WhatsApp (puede que la ventana de 24 h esté cerrada); comparte el portal desde Conversaciones.";
        await registrarActividad(sb, {
          expedienteId: p.expediente_id,
          tipo: "whatsapp",
          titulo: wa.ok ? "📲 Aviso de nuevas opciones enviado al cliente" : "⚠️ No se pudo enviar el aviso de nuevas opciones",
          detalle: wa.ok ? undefined : wa.error,
        });
      }
    }

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
        [
          publicadas > MAX_PUBLICADAS_POR_RONDA
            ? `Ya hay ${publicadas} opciones publicadas en la ronda ${p.ronda}; se recomiendan de 3 a ${MAX_PUBLICADAS_POR_RONDA}.`
            : null,
          avisoCliente ?? null,
        ]
          .filter(Boolean)
          .join(" ") || undefined,
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

// ============================================================================
// Fase 4: portal del cliente /seguimiento/[token] — "Tus opciones"
// Todas estas acciones son públicas: validan `expedientes.token` SIEMPRE y
// devuelven solo lo que arma `aOpcionCliente` (lista blanca de campos).
// ============================================================================

export interface PasoPortal {
  id: string;
  nombre: string;
  estado: "hecho" | "actual" | "pendiente";
}

export interface PortalCliente {
  ok: boolean;
  mensaje?: string;
  primerNombre?: string;
  tipoNegocio?: string;
  etapaNombre?: string;
  etapaDescripcion?: string;
  pasos?: PasoPortal[];
  asesorNombre?: string | null;
  /** Solo asesoría de compra con búsqueda. */
  conOpciones?: boolean;
  opciones?: OpcionCliente[];
}

const SITE = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");

/** Expediente por token público (columnas mínimas). */
async function expedientePorToken(sb: Sb, token: string) {
  if (!esTokenPortalValido(token)) return null;
  const { data } = await sb
    .from("expedientes")
    .select("id, cliente, telefono, prospecto_id, tipo_negocio, etapa, ya_tiene_casa, asesor_id, asesor:asesor_id(nombre)")
    .eq("token", token)
    .maybeSingle();
  return data as any;
}

/** Propuesta visible para el cliente dueño del token. */
async function propuestaDelCliente(sb: Sb, expedienteId: string, propuestaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(propuestaId)) return null;
  const { data } = await sb
    .from("propuestas_inmuebles")
    .select("id, expediente_id, estatus, vista_en, inmueble:inmueble_id(folio, precio, fraccionamiento, zona)")
    .eq("id", propuestaId)
    .eq("expediente_id", expedienteId)
    .maybeSingle();
  if (!data || !ESTATUS_VISIBLES_CLIENTE.includes(data.estatus as EstatusPropuesta)) return null;
  return data as any;
}

/** Portal del cliente: estatus del proceso y, en asesoría de compra, sus opciones de casa. */
export async function obtenerPortalCliente(token: string): Promise<PortalCliente> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false, mensaje: "Este enlace no es válido. Usa el que te enviamos por WhatsApp." };

  const opcionesEtapas = { yaTieneCasa: exp.ya_tiene_casa };
  const lista = obtenerEtapasPorNegocio(exp.tipo_negocio, opcionesEtapas).filter(
    (e) => e.id !== "perdido" && e.id !== "en_pausa",
  );
  const actual = obtenerEtapasPorId(exp.tipo_negocio)[exp.etapa];
  const idxActual = lista.findIndex((e) => e.id === exp.etapa);
  const pasos: PasoPortal[] = lista.map((e, i) => ({
    id: e.id,
    nombre: e.nombreCliente,
    estado: idxActual === -1 ? "pendiente" : i < idxActual ? "hecho" : i === idxActual ? "actual" : "pendiente",
  }));

  const conOpciones = exp.tipo_negocio === "asesoria_compra" && !exp.ya_tiene_casa;
  let opciones: OpcionCliente[] = [];
  if (conOpciones) {
    const { data: props } = await sb
      .from("propuestas_inmuebles")
      .select("id, estatus, publicada_en, inmueble:inmueble_id(*)")
      .eq("expediente_id", exp.id)
      .in("estatus", ESTATUS_VISIBLES_CLIENTE)
      .order("publicada_en", { ascending: false });
    const filas = (props ?? []).filter((p: any) => p.inmueble);
    const ids = filas.map((p: any) => p.id);
    const { data: citas } = ids.length
      ? await sb
          .from("agenda_citas")
          .select("propuesta_id, fecha, hora_inicio, estado")
          .in("propuesta_id", ids)
          .neq("estado", "cancelada")
          .order("fecha", { ascending: false })
      : { data: [] as any[] };
    const firmados = await firmarFotos(sb, filas.map((p: any) => filaAInmueble(p.inmueble)));
    opciones = filas.map((p: any, i: number) =>
      aOpcionCliente(
        { id: p.id, estatus: p.estatus },
        p.inmueble,
        firmados[i].fotosUrl,
        (citas ?? []).find((c: any) => c.propuesta_id === p.id) ?? null,
      ),
    );
  }

  return {
    ok: true,
    primerNombre: String(exp.cliente || "").trim().split(/\s+/)[0] || "",
    tipoNegocio: exp.tipo_negocio,
    etapaNombre: actual?.nombreCliente ?? "En proceso",
    etapaDescripcion: actual?.descripcionCliente ?? "",
    pasos,
    asesorNombre: exp.asesor?.nombre ?? null,
    conOpciones,
    opciones,
  };
}

/** El cliente abrió la opción: publicada → vista. */
export async function marcarOpcionVista(token: string, propuestaId: string): Promise<{ ok: boolean }> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false };
  const p = await propuestaDelCliente(sb, exp.id, propuestaId);
  if (!p || p.estatus !== "publicada") return { ok: Boolean(p) };
  await sb
    .from("propuestas_inmuebles")
    .update({ estatus: "vista", vista_en: new Date().toISOString() })
    .eq("id", p.id)
    .eq("estatus", "publicada");
  return { ok: true };
}

/** "Me interesa" o "Descartar" (con motivo) desde el portal. */
export async function responderOpcion(
  token: string,
  propuestaId: string,
  respuesta: { accion: "me_interesa" | "descartar"; motivo?: string; comentario?: string },
): Promise<{ ok: boolean; mensaje?: string }> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false, mensaje: "Enlace no válido." };
  const p = await propuestaDelCliente(sb, exp.id, propuestaId);
  if (!p) return { ok: false, mensaje: "Esta opción ya no está disponible." };
  if (!ESTATUS_RESPONDIBLES.includes(p.estatus)) return { ok: false, mensaje: "Esta opción ya tiene una visita en proceso." };

  const comentario = (respuesta.comentario ?? "").trim().slice(0, 500) || null;
  const ahora = new Date().toISOString();
  let payload: Record<string, any>;
  if (respuesta.accion === "descartar") {
    if (!esMotivoDescarte(respuesta.motivo)) return { ok: false, mensaje: "Elige un motivo." };
    payload = { estatus: "descartada", motivo_descarte: respuesta.motivo, comentario_cliente: comentario, respondida_en: ahora };
  } else {
    payload = { estatus: "me_interesa", comentario_cliente: comentario, respondida_en: ahora };
  }
  payload.vista_en = p.vista_en ?? ahora;
  const { error } = await sb.from("propuestas_inmuebles").update(payload).eq("id", p.id);
  if (error) return { ok: false, mensaje: "No se pudo guardar tu respuesta." };

  const casa = `${p.inmueble?.folio ?? ""} (${formatoPesos(Number(p.inmueble?.precio ?? 0))}${p.inmueble?.fraccionamiento ? `, ${p.inmueble.fraccionamiento}` : ""})`;
  const titulo =
    respuesta.accion === "descartar"
      ? `👎 El cliente descartó ${casa}: ${ETIQUETA_MOTIVO_DESCARTE[respuesta.motivo as MotivoDescarte]}`
      : `👍 Al cliente le interesa ${casa}`;
  await registrarActividad(sb, { expedienteId: exp.id, tipo: "sistema", titulo, detalle: comentario ?? undefined });
  if (respuesta.accion === "me_interesa") {
    await notificarAsesorTelegram(sb, {
      asesorId: exp.asesor_id,
      expedienteId: exp.id,
      texto: `👍 <b>${exp.id}</b>: al cliente le interesa ${casa}.${comentario ? `\n💬 ${comentario}` : ""}`,
    });
  }
  return { ok: true };
}

/** "Agendar visita": crea la cita ligada a la propuesta y avisa al asesor. */
export async function agendarVisitaOpcion(
  token: string,
  propuestaId: string,
  fecha: string,
  hora: string,
  comentario?: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false, mensaje: "Enlace no válido." };
  const p = await propuestaDelCliente(sb, exp.id, propuestaId);
  if (!p) return { ok: false, mensaje: "Esta opción ya no está disponible." };
  if (!ESTATUS_RESPONDIBLES.includes(p.estatus)) return { ok: false, mensaje: "Esta opción ya tiene una visita agendada." };
  const v = validarFechaVisita(fecha, hora);
  if (!v.ok) return v;

  const perfilId = exp.asesor_id || (await obtenerIdAsesorGerardo(sb));
  if (!perfilId) return { ok: false, mensaje: "No pudimos agendar en este momento. Escríbenos por WhatsApp." };
  const nota = (comentario ?? "").trim().slice(0, 500);
  const { error } = await sb.from("agenda_citas").insert({
    perfil_id: perfilId,
    expediente_id: exp.id,
    prospecto_id: exp.prospecto_id ?? null,
    propuesta_id: p.id,
    cliente_nombre: exp.cliente || "Cliente",
    cliente_telefono: exp.telefono || "",
    tipo_cita: "venta",
    fecha,
    hora_inicio: `${hora}:00`,
    hora_fin: `${v.horaFin}:00`,
    estado: "pendiente",
    fraccionamiento: p.inmueble?.fraccionamiento || p.inmueble?.zona || null,
    notas: `Visita a ${p.inmueble?.folio ?? "inmueble"} solicitada por el cliente desde su portal.${nota ? ` Comentario: ${nota}` : ""}`,
  });
  if (error) {
    console.error("[agendarVisitaOpcion]", error);
    return { ok: false, mensaje: "No se pudo agendar la visita." };
  }
  await sb
    .from("propuestas_inmuebles")
    .update({ estatus: "visita_agendada", respondida_en: new Date().toISOString(), comentario_cliente: nota || null })
    .eq("id", p.id);

  const casa = `${p.inmueble?.folio ?? ""} (${formatoPesos(Number(p.inmueble?.precio ?? 0))})`;
  await registrarActividad(sb, {
    expedienteId: exp.id,
    tipo: "visita",
    titulo: `🗓️ El cliente agendó visita a ${casa}`,
    detalle: `${fecha} a las ${hora}. Confirma con el cliente y coordina el acceso.`,
  });
  await notificarAsesorTelegram(sb, {
    asesorId: exp.asesor_id,
    expedienteId: exp.id,
    texto: `🗓️ <b>${exp.id}</b>: el cliente pidió visitar ${casa} el <b>${fecha}</b> a las <b>${hora}</b>.${nota ? `\n💬 ${nota}` : ""}\nConfirma la cita y coordina el acceso con el vendedor o aliado.`,
  });
  return { ok: true };
}

// ============================================================================
// Fase 5: seguimiento de la propuesta, cierre y KPIs
// ============================================================================

/** El asesor registra el avance de una propuesta tras la visita (visitada / ofertada). */
export async function actualizarEstatusPropuesta(
  propuestaId: string,
  estatus: "visitada" | "ofertada",
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    if (estatus !== "visitada" && estatus !== "ofertada") return { ok: false, mensaje: "Estatus inválido." };
    const sb = supabaseServidor();
    const { data: p } = await sb.from("propuestas_inmuebles").select("id, expediente_id, estatus").eq("id", propuestaId).maybeSingle();
    if (!p) return { ok: false, mensaje: "La propuesta no existe." };
    const permitidos = estatus === "visitada" ? ["me_interesa", "visita_agendada"] : ["me_interesa", "visita_agendada", "visitada"];
    if (!permitidos.includes(p.estatus)) return { ok: false, mensaje: "La propuesta no está en una etapa que permita ese cambio." };
    const { data: exp } = await sb.from("expedientes").select("asesor_id, operador_id").eq("id", p.expediente_id).maybeSingle();
    if (exp) await verificarAcceso(exp as any);
    const { error } = await sb.from("propuestas_inmuebles").update({ estatus }).eq("id", p.id);
    if (error) throw new Error(error.message);
    await registrarActividad(sb, {
      expedienteId: p.expediente_id,
      tipo: "sistema",
      titulo: estatus === "visitada" ? "🏠 Visita realizada" : "💬 Oferta presentada",
    });
    revalidatePath(`/expediente/${p.expediente_id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo actualizar." };
  }
}

/**
 * Cierre de la compra: la propuesta queda `elegida`, el inmueble `vendido`,
 * se guardan el precio y la fecha de escritura y, si la casa la aportó un
 * aliado, se crea en `comisiones` su pago (honorarios del lado comprador de
 * `comisiones_reglas` × su % compartido). Idempotente por propuesta.
 */
export async function registrarCierreCompra(
  propuestaId: string,
  datos: { precioCompraventa: number | string; fechaEscritura: string },
): Promise<{ ok: boolean; mensaje?: string; comisionAliado?: number | null }> {
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const precio = aMonto(datos.precioCompraventa);
    if (!precio || precio <= 0) return { ok: false, mensaje: "Captura el precio de compraventa." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaEscritura)) return { ok: false, mensaje: "Captura la fecha de firma de la escritura." };

    const sb = supabaseServidor();
    const { data: p } = await sb
      .from("propuestas_inmuebles")
      .select("id, expediente_id, estatus, inmueble:inmueble_id(id, folio, origen, aliado_id, estatus)")
      .eq("id", propuestaId)
      .maybeSingle();
    if (!p) return { ok: false, mensaje: "La propuesta no existe." };
    if (!["me_interesa", "visita_agendada", "visitada", "ofertada", "elegida"].includes(p.estatus)) {
      return { ok: false, mensaje: "Solo se cierra una opción que el cliente ya visitó u ofertó." };
    }
    const inm = (p as any).inmueble;
    const { data: exp } = await sb
      .from("expedientes")
      .select("id, cliente, asesor_id, operador_id")
      .eq("id", p.expediente_id)
      .maybeSingle();
    if (!exp) return { ok: false, mensaje: "El expediente no existe." };
    await verificarAcceso(exp as any);

    // Otra propuesta del mismo expediente ya elegida → no se permiten dos cierres.
    const { data: otra } = await sb
      .from("propuestas_inmuebles")
      .select("id")
      .eq("expediente_id", p.expediente_id)
      .eq("estatus", "elegida")
      .neq("id", p.id)
      .limit(1);
    if (otra && otra.length > 0) return { ok: false, mensaje: "Este expediente ya tiene otra casa elegida." };

    const ahora = new Date().toISOString();
    await sb.from("propuestas_inmuebles").update({ estatus: "elegida", respondida_en: ahora }).eq("id", p.id);
    if (inm?.id) await sb.from("inmuebles").update({ estatus: "vendido" }).eq("id", inm.id);
    await sb
      .from("expedientes")
      .update({ precio_compraventa: precio, fecha_escritura: datos.fechaEscritura, ultimo_movimiento: ahora.slice(0, 10) })
      .eq("id", p.expediente_id);

    let comisionAliado: number | null = null;
    if (inm?.origen === "aliado" && inm.aliado_id) {
      const [{ data: aliado }, { data: regla }] = await Promise.all([
        sb.from("proveedores").select("nombre, comision_compartida_pct, convenio_estatus, convenio_contrato_id").eq("id", inm.aliado_id).maybeSingle(),
        sb
          .from("comisiones_reglas")
          .select("porcentaje")
          .eq("tipo", "servicio")
          .eq("clave", "asesoria_compra_honorarios")
          .eq("activo", true)
          .maybeSingle(),
      ]);
      if (!regla) {
        await registrarActividad(sb, {
          expedienteId: p.expediente_id,
          tipo: "sistema",
          titulo: "⚠️ Falta la regla de honorarios del lado comprador",
          detalle: "Configura en Comisiones la regla de servicio 'asesoria_compra_honorarios' para calcular el pago al aliado.",
        });
      } else if (aliado && aliado.comision_compartida_pct != null) {
        const calc = calcularComisionAliado(precio, Number(regla.porcentaje), Number(aliado.comision_compartida_pct));
        comisionAliado = calc.montoAliado;
        const { data: existente } = await sb
          .from("comisiones")
          .select("id")
          .eq("propuesta_id", p.id)
          .eq("tipo_comision", "aliado")
          .neq("estatus", "cancelada")
          .maybeSingle();
        const fila = {
          tipo_comision: "aliado",
          proveedor_id: inm.aliado_id,
          asesor_id: null,
          expediente_id: p.expediente_id,
          propuesta_id: p.id,
          fecha: datos.fechaEscritura,
          monto_venta: precio,
          base_comisionable: calc.honorarios,
          porcentaje_comision: calc.pctEfectivo,
          monto_comision: calc.montoAliado,
          saldo_pendiente: calc.montoAliado,
          notas: `Comisión compartida con ${aliado.nombre} por ${inm.folio}.`,
          detalles_calculo: {
            origen: "asesoria_compra",
            folio: inm.folio,
            clienteNombre: exp.cliente,
            aliado: aliado.nombre,
            precioCompraventa: precio,
            pctHonorarios: calc.pctHonorarios,
            honorarios: calc.honorarios,
            pctAliado: calc.pctAliado,
            convenioContratoId: aliado.convenio_contrato_id,
            convenioEstatus: aliado.convenio_estatus,
          },
        };
        const { error: errCom } = existente
          ? await sb.from("comisiones").update(fila).eq("id", existente.id)
          : await sb.from("comisiones").insert(fila);
        if (errCom) throw new Error(errCom.message);
      } else {
        await registrarActividad(sb, {
          expedienteId: p.expediente_id,
          tipo: "sistema",
          titulo: "⚠️ El aliado no tiene % de comisión compartida",
          detalle: "Captura el % en el menú Aliados y vuelve a registrar el cierre para generar su comisión.",
        });
      }
    }

    await registrarActividad(sb, {
      expedienteId: p.expediente_id,
      tipo: "sistema",
      titulo: `🔑 Cierre: ${inm?.folio ?? "inmueble"} por ${formatoPesos(precio)}`,
      detalle: [
        `Escritura firmada el ${datos.fechaEscritura}.`,
        comisionAliado !== null ? `Comisión al aliado: ${formatoPesos(comisionAliado)}.` : null,
        usuario?.email ? `Registró: ${usuario.email}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
    revalidatePath(`/expediente/${p.expediente_id}`);
    return { ok: true, comisionAliado };
  } catch (err) {
    console.error("[registrarCierreCompra]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo registrar el cierre." };
  }
}

export interface KpisAsesoriaCompra {
  expedientes: number;
  diasPrecalificacionAPrimeraOpcion: number | null;
  opcionesPorRonda: number | null;
  tasaMeInteresa: number | null;
  tasaVisitaAOferta: number | null;
  cierres: number;
  cierresPorOrigen: { propio: number; aliado: number; portal: number };
  diasCaptacionAEscritura: number | null;
  aliados: { nombre: string; busquedas: number; tasaRespuesta: number | null; casas: number }[];
}

const promedio = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** KPIs de la línea (vistas v_asesoria_compra_kpis y v_asesoria_compra_aliados_kpis). */
export async function obtenerKpisAsesoriaCompra(): Promise<KpisAsesoriaCompra> {
  await requireAdmin();
  const sb = supabaseServidor();
  const [{ data: filas }, { data: aliados }] = await Promise.all([
    sb.from("v_asesoria_compra_kpis").select("*"),
    sb.from("v_asesoria_compra_aliados_kpis").select("*").order("busquedas", { ascending: false }),
  ]);
  const f = (filas ?? []) as any[];
  const num = (k: string) => f.map((r) => r[k]).filter((v) => v !== null && v !== undefined).map(Number);
  const publicadas = f.reduce((a, r) => a + Number(r.opciones_publicadas || 0), 0);
  const conInteres = f.reduce((a, r) => a + Number(r.opciones_con_interes || 0), 0);
  const visitadas = f.reduce((a, r) => a + Number(r.opciones_visitadas || 0), 0);
  const ofertadas = f.reduce((a, r) => a + Number(r.opciones_ofertadas || 0), 0);
  const rondas = f.reduce((a, r) => a + Number(r.rondas || 0), 0);
  const cierres = f.filter((r) => r.origen_cierre);
  return {
    expedientes: f.length,
    diasPrecalificacionAPrimeraOpcion: promedio(num("dias_precalificacion_a_primera_opcion")),
    opcionesPorRonda: rondas ? Math.round((publicadas / rondas) * 10) / 10 : null,
    tasaMeInteresa: publicadas ? conInteres / publicadas : null,
    tasaVisitaAOferta: visitadas ? ofertadas / visitadas : null,
    cierres: cierres.length,
    cierresPorOrigen: {
      propio: cierres.filter((r) => r.origen_cierre === "propio").length,
      aliado: cierres.filter((r) => r.origen_cierre === "aliado").length,
      portal: cierres.filter((r) => r.origen_cierre === "portal").length,
    },
    diasCaptacionAEscritura: promedio(num("dias_captacion_a_escritura")),
    aliados: ((aliados ?? []) as any[]).map((a) => ({
      nombre: a.nombre,
      busquedas: Number(a.busquedas),
      tasaRespuesta: a.tasa_respuesta === null ? null : Number(a.tasa_respuesta),
      casas: Number(a.casas_recibidas),
    })),
  };
}
