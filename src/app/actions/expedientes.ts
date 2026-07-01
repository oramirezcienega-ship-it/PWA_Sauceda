"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
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

/** Lista todos los expedientes (panel del admin, filtrado si es asesor). */
export async function listarExpedientes(): Promise<Expediente[]> {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);

  const sb = supabaseServidor();
  let query = sb
    .from("expedientes")
    .select("*, prospectos(origen), perfiles:asesor_id(nombre)");

  if (rol === "asesor" || rol === "operaciones") {
    query = query.eq("asesor_id", usuario.id);
  }

  const { data, error } = await query.order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const expedientesFilas = (data as FilaExpediente[]) ?? [];
  const expIds = expedientesFilas.map((e) => e.id);
  const prospectoIds = expedientesFilas.map((e) => e.prospecto_id).filter(Boolean) as string[];

  // 1. Obtener enrolamientos activos de secuencias para estos expedientes o sus prospectos
  const secuenciasMap = new Map<string, string>();
  if (expIds.length > 0) {
    let querySec = sb
      .from("sequence_enrollments")
      .select("expediente_id, prospecto_id, automation_sequences(nombre)")
      .eq("status", "activo");

    if (prospectoIds.length > 0) {
      querySec = querySec.or(`expediente_id.in.(${expIds.join(",")}),prospecto_id.in.(${prospectoIds.join(",")})`);
    } else {
      querySec = querySec.in("expediente_id", expIds);
    }

    const { data: enrollments } = await querySec;

    if (enrollments) {
      enrollments.forEach((en: any) => {
        if (en.automation_sequences?.nombre) {
          if (en.expediente_id) {
            secuenciasMap.set(en.expediente_id, en.automation_sequences.nombre);
          } else if (en.prospecto_id) {
            const foundExp = expedientesFilas.find((x) => x.prospecto_id === en.prospecto_id);
            if (foundExp) {
              secuenciasMap.set(foundExp.id, en.automation_sequences.nombre);
            }
          }
        }
      });
    }
  }

  // 2. Obtener la última actividad para cada uno de estos expedientes
  const ultimaActividadMap = new Map<string, { titulo: string; created_at: string }>();
  if (expIds.length > 0) {
    const { data: acts } = await sb
      .from("actividades")
      .select("expediente_id, titulo, created_at")
      .in("expediente_id", expIds)
      .order("created_at", { ascending: false });

    if (acts) {
      acts.forEach((act) => {
        if (act.expediente_id && !ultimaActividadMap.has(act.expediente_id)) {
          ultimaActividadMap.set(act.expediente_id, {
            titulo: act.titulo,
            created_at: act.created_at,
          });
        }
      });
    }
  }

  return expedientesFilas.map((e) => {
    const mapped = aExpediente(e);
    return {
      ...mapped,
      secuenciaNombre: secuenciasMap.get(e.id) || null,
      ultimaActividadTitulo: ultimaActividadMap.get(e.id)?.titulo || null,
      ultimaActividadFecha: ultimaActividadMap.get(e.id)?.created_at || null,
    };
  });
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
    .select("*, prospectos(origen), perfiles:asesor_id(nombre)")
    .single();
  if (error) throw new Error(error.message);

  // Sincroniza el asesor con el prospecto (bidireccional)
  if (datos.prospectoId) {
    await sb
      .from("prospectos")
      .update({ asesor_id: datos.asesorId ?? null })
      .eq("id", datos.prospectoId);
    const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
    await sincronizarEstatusProspecto(sb, datos.prospectoId);
  }

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
  if (nuevos.etapa === "perdido") {
    nuevos.asesor_id = null;
    datos.asesorId = null;
  }
  const { data, error } = await sb
    .from("expedientes")
    .update({ ...nuevos, ultimo_movimiento: hoyISO() })
    .eq("id", id)
    .select("*, prospectos(origen), perfiles:asesor_id(nombre)")
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

  // Sincroniza los campos compartidos (nombre + teléfono + asesor) con el prospecto.
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
        asesor_id: datos.asesorId ?? null,
      })
      .eq("id", datos.prospectoId);
    const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
    await sincronizarEstatusProspecto(sb, datos.prospectoId);
  }

  // Si cambió el prospecto enlazado, sincronizar también el anterior
  if (antes?.prospecto_id && antes.prospecto_id !== datos.prospectoId) {
    const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
    await sincronizarEstatusProspecto(sb, antes.prospecto_id);
  }

  return aExpediente(data as FilaExpediente);
}

/** Cambia la etapa de un expediente. */
export async function moverEtapa(id: string, etapa: EtapaId): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Obtener prospecto_id antes de actualizar
  const { data: exp } = await sb
    .from("expedientes")
    .select("prospecto_id")
    .eq("id", id)
    .maybeSingle();

  const updatePayload: any = { etapa, ultimo_movimiento: hoyISO() };
  if (etapa === "perdido") {
    updatePayload.asesor_id = null;
  }

  const { error } = await sb
    .from("expedientes")
    .update(updatePayload)
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (exp?.prospecto_id) {
    if (etapa === "perdido") {
      await sb
        .from("prospectos")
        .update({ asesor_id: null })
        .eq("id", exp.prospecto_id);
    }
    const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
    await sincronizarEstatusProspecto(sb, exp.prospecto_id);
  }

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

  // Obtener todos los prospecto_ids únicos
  const { data: exps } = await sb
    .from("expedientes")
    .select("prospecto_id")
    .in("id", ids);

  const updatePayload: any = { etapa, ultimo_movimiento: hoyISO() };
  if (etapa === "perdido") {
    updatePayload.asesor_id = null;
  }

  const { error } = await sb
    .from("expedientes")
    .update(updatePayload)
    .in("id", ids);
  if (error) throw new Error(error.message);

  if (etapa === "perdido" && exps && exps.length > 0) {
    const propIds = Array.from(new Set(exps.map((e) => e.prospecto_id).filter(Boolean))) as string[];
    if (propIds.length > 0) {
      await sb
        .from("prospectos")
        .update({ asesor_id: null })
        .in("id", propIds);
    }
  }

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

  if (exps) {
    const propIds = Array.from(new Set(exps.map((e) => e.prospecto_id).filter(Boolean))) as string[];
    const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
    for (const propId of propIds) {
      await sincronizarEstatusProspecto(sb, propId);
    }
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

/** Guarda o actualiza las notas de un expediente prependiéndola con fecha y nombre del asesor. */
export async function guardarNotaExpediente(id: string, nuevaNota: string): Promise<void> {
  await requireAdmin();
  if (!nuevaNota || !nuevaNota.trim()) return;
  const sb = supabaseServidor();

  // 1. Obtener nombre del usuario actual
  const { obtenerUsuarioActual } = await import("@/app/actions/usuarios");
  const usuario = await obtenerUsuarioActual();
  const nombreAsesor = usuario?.nombre || "Asesor";

  // 2. Obtener notas existentes
  const { data: exp } = await sb
    .from("expedientes")
    .select("notas")
    .eq("id", id)
    .maybeSingle();

  const existentes = exp?.notas || "";

  // 3. Formatear la nueva nota prependida
  const fechaStr = new Date().toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const header = `[${fechaStr} - ${nombreAsesor}]`;
  const notasActualizadas = `${header}\n${nuevaNota.trim()}${existentes ? `\n\n${existentes}` : ""}`;

  // 4. Guardar
  const { error } = await sb
    .from("expedientes")
    .update({ notas: notasActualizadas, ultimo_movimiento: hoyISO() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
