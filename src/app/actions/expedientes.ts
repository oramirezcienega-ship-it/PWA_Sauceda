"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { aExpediente, aFila, type FilaExpediente } from "@/lib/supabase/mapeo";
import { ETAPAS, ETAPAS_POR_ID } from "@/lib/etapas";
import { registrarActividad } from "@/lib/actividades";
import { enviarBienvenida } from "@/lib/bienvenida";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { dispararEvento } from "@/lib/automatizaciones/motor";
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
  // Bienvenida automática (correo + WhatsApp + portal). Best-effort.
  await enviarBienvenida(sb, id);
  // Dispara automatizaciones del evento "nuevo expediente".
  await dispararEvento(sb, "nuevo-expediente", {
    expedienteId: id,
    prospectoId: datos.prospectoId,
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

  // Lee el estado anterior para detectar qué columnas cambian (automatizaciones).
  const { data: antes } = await sb
    .from("expedientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const nuevos = aFila(datos);
  const { data, error } = await sb
    .from("expedientes")
    .update({ ...nuevos, ultimo_movimiento: hoyISO() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Campos que realmente cambiaron respecto al estado anterior.
  const cambios = antes
    ? Object.keys(nuevos).filter(
        (k) =>
          String((antes as Record<string, unknown>)[k] ?? "") !==
          String((nuevos as Record<string, unknown>)[k] ?? ""),
      )
    : Object.keys(nuevos);
  if (cambios.length > 0) {
    await dispararEvento(sb, "cambio-campo", { expedienteId: id, cambios });
    // Si cambió la etapa desde el formulario de edición, también cuenta como
    // "cambio de etapa" (para que disparen esas reglas sin importar la vía).
    if (cambios.includes("etapa")) {
      await dispararEvento(sb, "cambio-etapa", {
        expedienteId: id,
        cambios: ["etapa"],
      });
    }
  }

  // Sincroniza los campos compartidos (nombre + teléfono) con el prospecto.
  if (datos.prospectoId) {
    await sb
      .from("prospectos")
      .update({
        nombre: datos.cliente,
        primer_apellido: datos.primerApellido,
        segundo_apellido: datos.segundoApellido,
        telefono: datos.telefono,
        ad_name: datos.adName,
        adset_name: datos.adsetName,
        campaign_name: datos.campaignName,
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
  // Dispara automatizaciones del evento "cambio de etapa".
  await dispararEvento(sb, "cambio-etapa", {
    expedienteId: id,
    cambios: ["etapa"],
  });
}

/** Cambia la etapa de varios expedientes a la vez (acción masiva). */
export async function moverEtapaMasivo(
  ids: string[],
  etapa: EtapaId,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const sb = supabaseServidor();
  const { error } = await sb
    .from("expedientes")
    .update({ etapa, ultimo_movimiento: hoyISO() })
    .in("id", ids);
  if (error) throw new Error(error.message);
  // Bitácora + automatizaciones por cada expediente afectado (best-effort).
  for (const id of ids) {
    await registrarActividad(sb, {
      expedienteId: id,
      tipo: "etapa",
      titulo: `Movido a ${ETAPAS_POR_ID[etapa].nombre}`,
    });
    await dispararEvento(sb, "cambio-etapa", {
      expedienteId: id,
      cambios: ["etapa"],
    });
  }
}

/** Elimina varios expedientes a la vez (acción masiva). */
export async function eliminarExpedientesMasivo(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const sb = supabaseServidor();
  const { error } = await sb.from("expedientes").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Envía el enlace del portal del cliente por WhatsApp usando la API
 * (Meta Cloud API), sin abrir WhatsApp Web. Devuelve el resultado para
 * mostrar retroalimentación al asesor.
 */
export async function enviarEnlacePortalWhatsApp(
  id: string,
): Promise<{ ok: boolean; mensaje: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data } = await sb
    .from("expedientes")
    .select("token, telefono, cliente")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false, mensaje: "Expediente no encontrado." };
  const d = data as {
    token: string;
    telefono: string | null;
    cliente: string | null;
  };
  if (!d.telefono) {
    return { ok: false, mensaje: "El expediente no tiene teléfono." };
  }

  const base = process.env.SITE_URL || "https://app.saucedamx.com";
  const url = `${base}/seguimiento/${d.token}`;
  const nombre = (d.cliente ?? "").split(" ")[0] || "";
  const texto =
    `Hola ${nombre}, soy de SAUCEDA Bienes Raíces. ` +
    `Da seguimiento a tu trámite y completa tus formularios aquí: ${url}`;

  const r = await enviarWhatsAppTexto(d.telefono, texto);
  if (!r.ok) {
    return { ok: false, mensaje: r.error ?? "No se pudo enviar el WhatsApp." };
  }
  await registrarActividad(sb, {
    expedienteId: id,
    tipo: "mensaje",
    titulo: "Enlace del portal enviado por WhatsApp",
    detalle: url,
  });
  return { ok: true, mensaje: "Enlace enviado por WhatsApp ✓" };
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
      ad_name: (f.ad_name ?? "").trim(),
      adset_name: (f.adset_name ?? "").trim(),
      campaign_name: (f.campaign_name ?? "").trim(),
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
