"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { aExpediente, aFila, type FilaExpediente } from "@/lib/supabase/mapeo";
import { ETAPAS, ETAPAS_POR_ID } from "@/lib/etapas";
import { registrarActividad } from "@/lib/actividades";
import type { DatosExpediente, EtapaId, Expediente } from "@/lib/types";

/** Convierte un texto a entero ignorando símbolos ($ , .). */
function aEntero(s: string | undefined): number {
  return parseInt((s ?? "").replace(/[^\d]/g, ""), 10) || 0;
}

/**
 * Server actions del módulo OPERACIÓN.
 * Toda la lectura/escritura de expedientes en Supabase pasa por aquí
 * (en el servidor). El navegador nunca habla directo con la base de datos.
 *
 * Las acciones del admin exigen sesión (`requireAdmin`). La única acción
 * pública es `obtenerPorToken` (portal del cliente).
 */

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Genera el siguiente folio correlativo tipo EXP-007. */
function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `EXP-${String(max + 1).padStart(3, "0")}`;
}

/** Lista todos los expedientes (panel del admin). */
export async function listarExpedientes(): Promise<Expediente[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("expedientes")
    .select("*, prospectos(origen)")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaExpediente[]).map(aExpediente);
}

/**
 * Variante que NO lanza: captura el error en el servidor y lo devuelve como
 * dato, para poder mostrarlo en el cliente (Next.js oculta los mensajes de
 * los errores lanzados en producción).
 */
export async function cargarExpedientes(): Promise<
  { ok: true; expedientes: Expediente[] } | { ok: false; mensaje: string }
> {
  try {
    const expedientes = await listarExpedientes();
    return { ok: true, expedientes };
  } catch (err) {
    return {
      ok: false,
      mensaje: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/** Obtiene un expediente por su token público (portal del cliente). */
export async function obtenerPorToken(
  token: string,
): Promise<Expediente | null> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("expedientes")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aExpediente(data as FilaExpediente) : null;
}

/** Crea un expediente nuevo y devuelve el registro creado. */
export async function crearExpediente(
  datos: DatosExpediente,
): Promise<Expediente> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Genera el folio correlativo a partir de los existentes.
  const { data: existentes, error: errLista } = await sb
    .from("expedientes")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const { data, error } = await sb
    .from("expedientes")
    .insert({ id, ...aFila(datos), ultimo_movimiento: hoyISO() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await registrarActividad(sb, {
    expedienteId: id,
    prospectoId: datos.prospectoId,
    tipo: "creacion",
    titulo: "Expediente creado",
  });
  return aExpediente(data as FilaExpediente);
}

/** Actualiza los datos editables de un expediente. */
export async function actualizarExpediente(
  id: string,
  datos: DatosExpediente,
): Promise<Expediente> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("expedientes")
    .update({ ...aFila(datos), ultimo_movimiento: hoyISO() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Sincroniza los campos compartidos (nombre + teléfono) con el prospecto.
  if (datos.prospectoId) {
    await sb
      .from("prospectos")
      .update({
        nombre: datos.cliente,
        primer_apellido: datos.primerApellido,
        segundo_apellido: datos.segundoApellido,
        telefono: datos.telefono,
      })
      .eq("id", datos.prospectoId);
  }

  return aExpediente(data as FilaExpediente);
}

/** Cambia la etapa de un expediente. */
export async function moverEtapa(id: string, etapa: EtapaId): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("expedientes")
    .update({ etapa, ultimo_movimiento: hoyISO() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await registrarActividad(sb, {
    expedienteId: id,
    tipo: "etapa",
    titulo: `Movido a ${ETAPAS_POR_ID[etapa].nombre}`,
  });
}

/** Elimina un expediente. */
export async function eliminarExpediente(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("expedientes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Importa expedientes desde filas de un CSV (objetos por encabezado).
 * Columnas esperadas: cliente, fraccionamiento, etapa, situacion, telefono,
 * valor_estimado, saldo_deuda, notas. Solo cliente y fraccionamiento son
 * obligatorios.
 */
export async function importarExpedientes(
  filas: Record<string, string>[],
): Promise<{ importados: number; errores: string[] }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const errores: string[] = [];

  const { data: existentes } = await sb.from("expedientes").select("id");
  let n = Math.max(
    0,
    ...(existentes ?? [])
      .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
      .filter((x) => !Number.isNaN(x)),
  );

  const etapasValidas = ETAPAS.map((e) => e.id) as string[];
  const aInsertar: Record<string, unknown>[] = [];

  filas.forEach((f, idx) => {
    // Acepta "nombre" (preferido) o "cliente" (nombre completo) como nombre.
    const cliente = (f.nombre ?? f.cliente ?? "").trim();
    const fraccionamiento = (f.fraccionamiento ?? "").trim();
    if (!cliente || !fraccionamiento) {
      errores.push(`Fila ${idx + 1}: faltan "nombre" o "fraccionamiento".`);
      return;
    }
    let etapa = (f.etapa ?? "nuevo-lead").trim();
    if (!etapasValidas.includes(etapa)) etapa = "nuevo-lead";
    n++;
    aInsertar.push({
      id: `EXP-${String(n).padStart(3, "0")}`,
      cliente,
      primer_apellido: (f.primer_apellido ?? "").trim(),
      segundo_apellido: (f.segundo_apellido ?? "").trim(),
      fraccionamiento,
      etapa,
      situacion: (f.situacion ?? "").trim(),
      telefono: (f.telefono ?? "").trim(),
      valor_estimado: aEntero(f.valor_estimado ?? f.valor),
      saldo_deuda: aEntero(f.saldo_deuda ?? f.saldo),
      notas: (f.notas ?? "").trim(),
      ultimo_movimiento: hoyISO(),
    });
  });

  if (aInsertar.length > 0) {
    const { error } = await sb.from("expedientes").insert(aInsertar);
    if (error) {
      errores.push(`Error al insertar: ${error.message}`);
      return { importados: 0, errores };
    }
  }
  return { importados: aInsertar.length, errores };
}
