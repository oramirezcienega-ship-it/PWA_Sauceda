"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import { aExpediente, aFila, type FilaExpediente } from "@/lib/supabase/mapeo";
import { ETAPAS, ETAPAS_POR_ID } from "@/lib/etapas";
import { registrarActividad } from "@/lib/actividades";
import { enviarBienvenida } from "@/lib/bienvenida";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { validarAgendaOperador } from "@/app/actions/agenda";
import type { DatosExpediente, EtapaId, Expediente, CalificacionProspecto } from "@/lib/types";

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
    .select("*, prospectos(origen), asesor:asesor_id(nombre), operador:operador_id(nombre)");

  if (rol === "asesor") {
    query = query.eq("asesor_id", usuario.id);
  } else if (rol === "operaciones") {
    query = query.eq("operador_id", usuario.id);
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

/** Asegura que exista un prospecto vinculado al expediente (lo busca por teléfono o lo crea en automático). */
async function asegurarProspectoParaExpediente(
  sb: ReturnType<typeof supabaseServidor>,
  datos: DatosExpediente
): Promise<string> {
  if (datos.prospectoId) {
    return datos.prospectoId;
  }

  const telNorm = (datos.telefono || "").replace(/\D/g, "").slice(-10);

  // 1. Buscar si ya existe un prospecto con el mismo teléfono
  if (telNorm) {
    const { data: prosList } = await sb
      .from("prospectos")
      .select("id, telefono");

    const existente = (prosList ?? []).find(
      (p: any) => (p.telefono || "").replace(/\D/g, "").slice(-10) === telNorm
    );

    if (existente) {
      return existente.id;
    }
  }

  // 2. Si no existe, AUTO-CREAR el Prospecto correspondiente
  const { data: prospectosExistentes } = await sb.from("prospectos").select("id");
  const prosIds = (prospectosExistentes ?? []).map((r) => r.id as string);
  const numeros = prosIds
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  const nuevoProsId = `PRO-${String(max + 1).padStart(3, "0")}`;

  const { error: errPros } = await sb.from("prospectos").insert({
    id: nuevoProsId,
    nombre: datos.cliente || "Cliente",
    primer_apellido: datos.primerApellido || "",
    segundo_apellido: datos.segundoApellido || "",
    telefono: datos.telefono || "",
    correo: (datos as any).email || (datos as any).correo || "",
    direccion: datos.direccionPropiedad || "",
    origen: (datos as any).origen || "otro",
    estatus: "nuevo",
    asesor_id: datos.asesorId || null,
    operador_id: datos.operadorId || null,
  });

  if (errPros) {
    console.error("Error al auto-crear prospecto para expediente:", errPros);
    return "";
  }

  await registrarActividad(sb, {
    prospectoId: nuevoProsId,
    tipo: "creacion",
    titulo: "Prospecto auto-creado desde Expediente",
    detalle: `Generado automáticamente al crear el expediente de ${datos.cliente}.`,
  });

  return nuevoProsId;
}

/** Crea un expediente nuevo y devuelve el registro creado. */
export async function crearExpediente(
  datos: DatosExpediente,
): Promise<Expediente> {
  await requireAdmin();
  const sb = supabaseServidor();

  if (datos.operadorId) {
    const agendaValida = await validarAgendaOperador(datos.operadorId);
    if (!agendaValida) {
      throw new Error(
        "El operario seleccionado no tiene horarios disponibles configurados o libres en los próximos 14 días.",
      );
    }
  }

  // Auto-crear o vincular el prospecto si no fue proporcionado expresamente
  const prospectoIdAuto = await asegurarProspectoParaExpediente(sb, datos);
  if (prospectoIdAuto) {
    datos.prospectoId = prospectoIdAuto;
  }

  // Genera el folio correlativo a partir de los existentes.
  const { data: existentes, error: errLista } = await sb
    .from("expedientes")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const { data, error } = await sb
    .from("expedientes")
    .insert({ id, ...aFila(datos), prospecto_id: datos.prospectoId || null, ultimo_movimiento: hoyISO() })
    .select("*, prospectos(origen), asesor:asesor_id(nombre), operador:operador_id(nombre)")
    .single();
  if (error) throw new Error(error.message);

  // Sincroniza todos los campos compartidos con el prospecto (bidireccional)
  if (datos.prospectoId) {
    const syncObj: Record<string, any> = {
      nombre: datos.cliente,
      primer_apellido: datos.primerApellido,
      segundo_apellido: datos.segundoApellido,
      telefono: datos.telefono,
      fraccionamiento: datos.fraccionamiento,
      asesor_id: datos.asesorId ?? null,
      operador_id: datos.operadorId ?? null,
    };
    if ((datos as any).email !== undefined) syncObj.email = (datos as any).email;
    await sb
      .from("prospectos")
      .update(syncObj)
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

  // Notificar al asesor si fue asignado de inicio
  if (datos.asesorId) {
    const { notificarAsignacionAsesor } = await import("@/lib/notificaciones-sistema");
    void notificarAsignacionAsesor(id, datos.asesorId);
  }

  // Notificar al cliente sobre el operario asignado de inicio
  if (datos.operadorId) {
    const { notificarAsignacionOperarioACliente } = await import("@/lib/notificaciones-sistema");
    void notificarAsignacionOperarioACliente(sb, id, datos.prospectoId || null, datos.operadorId);
  }

  // Instanciar flujo de trabajo BPM si existe plantilla para este tipo de negocio
  if (datos.tipoNegocio) {
    const { instanciarFlujoEnExpediente } = await import("@/app/actions/bpm");
    void instanciarFlujoEnExpediente(id, datos.tipoNegocio);
  }

  return aExpediente(data as FilaExpediente);
}

/** Actualiza los datos editables de un expediente. */
export async function actualizarExpediente(
  id: string,
  datos: DatosExpediente,
): Promise<Expediente> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  // Lee el estado anterior para detectar qué columnas cambian (automatizaciones).
  const { data: antes } = await sb
    .from("expedientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (datos.operadorId && datos.operadorId !== antes?.operador_id) {
    const agendaValida = await validarAgendaOperador(datos.operadorId);
    if (!agendaValida) {
      throw new Error(
        "El operario seleccionado no tiene horarios disponibles configurados o libres en los próximos 14 días.",
      );
    }
  }

  if (rol === "asesor" || rol === "operaciones") {
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if (antes?.[colId] !== usuario.id) {
      throw new Error("No estás autorizado para modificar este expediente.");
    }
  }

  const nuevos = aFila(datos);
  if (nuevos.etapa === "perdido") {
    nuevos.asesor_id = null;
    datos.asesorId = null;
  }

  const { data, error } = await sb
    .from("expedientes")
    .update({ ...nuevos, ultimo_movimiento: hoyISO() })
    .eq("id", id)
    .select("*, prospectos(origen), asesor:asesor_id(nombre), operador:operador_id(nombre)")
    .single();

  if (error) {
    console.error(`[DEBUG actualizarExpediente] ERROR DB: ${error.message} | tipo_negocio enviado="${nuevos.tipo_negocio}"`);
    throw new Error(error.message);
  }

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

  // Sincroniza los campos compartidos (nombre + teléfono + asesor + operador + dirección) con el prospecto.
  if (datos.prospectoId) {
    await sb
      .from("prospectos")
      .update({
        nombre: datos.cliente,
        primer_apellido: datos.primerApellido,
        segundo_apellido: datos.segundoApellido,
        telefono: datos.telefono,
        direccion: datos.direccionPropiedad || "",
        ad_name: datos.adName,
        adset_name: datos.adsetName,
        campaign_name: datos.campaignName,
        asesor_id: datos.asesorId ?? null,
        operador_id: datos.operadorId ?? null,
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

  // Notificar al asesor si cambió o se asignó por primera vez
  if (cambios.includes("asesor_id") && datos.asesorId) {
    const { notificarAsignacionAsesor } = await import("@/lib/notificaciones-sistema");
    void notificarAsignacionAsesor(id, datos.asesorId);
  }

  // Notificar al cliente si cambió o se asignó por primera vez el operario
  if (cambios.includes("operador_id") && datos.operadorId) {
    const { notificarAsignacionOperarioACliente } = await import("@/lib/notificaciones-sistema");
    void notificarAsignacionOperarioACliente(sb, id, datos.prospectoId || null, datos.operadorId);
  }

  // Sincronizar asignados de BPM si cambió asesor u operador
  if (cambios.includes("asesor_id") || cambios.includes("operador_id")) {
    const { sincronizarAsignadosBpm } = await import("@/app/actions/bpm");
    void sincronizarAsignadosBpm(id, datos.asesorId ?? null, datos.operadorId ?? null);
  }

  return aExpediente(data as FilaExpediente);
}

/** Cambia la etapa de un expediente. */
export async function moverEtapa(id: string, etapa: EtapaId): Promise<void> {
  await requireAdmin();
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  // Obtener prospecto_id antes de actualizar
  const { data: exp } = await sb
    .from("expedientes")
    .select("prospecto_id, asesor_id, operador_id")
    .eq("id", id)
    .maybeSingle();

  if (rol === "asesor" || rol === "operaciones") {
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if (exp?.[colId] !== usuario.id) {
      throw new Error("No estás autorizado para modificar este expediente.");
    }
  }

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

  // Trigger automático: Si la etapa pasa a valuación (y tipo_negocio es promoción venta), inicializar portal del cliente
  if (etapa === "valuacion") {
    await asegurarPortalCliente(sb, id);
  }

  // Dispara automatizaciones del evento "cambio de etapa".
  await dispararEvento(sb, "cambio-etapa", {
    expedienteId: id,
    cambios: ["etapa"],
  });
}

/**
 * Garantiza que exista la fila en promociones_expedientes y genera el
 * session_token_client + token_expiration si aún no los tiene.
 * Envía por WhatsApp el enlace público del portal si cuenta con teléfono.
 */
export async function asegurarPortalCliente(
  sb: SupabaseClient,
  expedienteId: string,
): Promise<{ token: string; url: string }> {
  const { data: exp } = await sb
    .from("expedientes")
    .select("id, cliente, primer_apellido, segundo_apellido, telefono, session_token_client, token_expiration, tipo_negocio")
    .eq("id", expedienteId)
    .maybeSingle();

  if (!exp) throw new Error("Expediente no encontrado");

  let token = exp.session_token_client;
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 90);

  if (!token) {
    token = crypto.randomUUID();
    await sb
      .from("expedientes")
      .update({
        session_token_client: token,
        token_expiration: expirationDate.toISOString(),
      })
      .eq("id", expedienteId);
  }

  const { data: promo } = await sb
    .from("promociones_expedientes")
    .select("id")
    .eq("expediente_id", expedienteId)
    .maybeSingle();

  if (!promo) {
    const nombreCompleto = [exp.cliente, exp.primer_apellido, exp.segundo_apellido].filter(Boolean).join(" ");
    await sb.from("promociones_expedientes").insert({
      expediente_id: expedienteId,
      nombre_titular: nombreCompleto,
      telefono_titular: exp.telefono,
    });
  }

  const siteUrl = process.env.SITE_URL || "https://app.saucedamx.com";
  const urlPortal = `${siteUrl}/expediente-cliente/${expedienteId}?token=${token}`;

  if (exp.telefono) {
    try {
      const mensaje = `¡Hola ${exp.cliente || "Cliente"}! 👋 Tu expediente ha pasado a la etapa de Valuación.\n\nPuedes revisar y confirmar la información de tu propiedad en tu portal personalizado:\n${urlPortal}`;
      await enviarWhatsAppTexto(exp.telefono, mensaje);
    } catch (e) {
      console.error("No se pudo enviar WhatsApp con la liga del portal:", e);
    }
  }

  return { token, url: urlPortal };
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

/** Marca o desmarca un expediente como No Viable. */
export async function marcarExpedienteNoViable(id: string, noViable: boolean): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("expedientes")
    .update({ no_viable: noViable })
    .eq("id", id);
  if (error) throw new Error(error.message);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/expediente/${id}`);
  revalidatePath("/");
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
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  const sb = supabaseServidor();

  if (rol === "asesor" || rol === "operaciones") {
    const { data: exp } = await sb
      .from("expedientes")
      .select("asesor_id, operador_id")
      .eq("id", id)
      .maybeSingle();
    const colId = rol === "asesor" ? "asesor_id" : "operador_id";
    if (exp?.[colId] !== usuario.id) {
      throw new Error("No estás autorizado para eliminar este expediente.");
    }
  }

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

/** Obtiene los datos de la promoción y del portal del cliente vinculados al expediente. */
export async function obtenerPromocionExpediente(expedienteId: string) {
  const sb = supabaseServidor();
  const { data: promo } = await sb
    .from("promociones_expedientes")
    .select("*")
    .eq("expediente_id", expedienteId)
    .maybeSingle();

  const { data: exp } = await sb
    .from("expedientes")
    .select("session_token_client, status_proceso, fecha_confirmacion, fecha_fotos_agendadas, litigios_bloqueado")
    .eq("id", expedienteId)
    .maybeSingle();

  return {
    promocion: promo ?? null,
    sessionTokenClient: exp?.session_token_client ?? null,
    statusProceso: exp?.status_proceso ?? null,
    fechaConfirmacion: exp?.fecha_confirmacion ?? null,
    fechaFotosAgendadas: exp?.fecha_fotos_agendadas ?? null,
    litigiosBloqueado: exp?.litigios_bloqueado ?? false,
  };
}

/** Wrapper de Server Action para llamarse desde componentes de cliente. */
export async function asegurarPortalClienteAction(expedienteId: string) {
  const sb = supabaseServidor();
  return asegurarPortalCliente(sb, expedienteId);
}

export interface FotoExpediente {
  id: string;
  expediente_id: string;
  url: string;
  nombre_archivo: string | null;
  rotacion: number;
  orden: number;
  created_at: string;
}

/** Obtiene las fotos adjuntas a un expediente. */
export async function obtenerFotosExpediente(expedienteId: string): Promise<FotoExpediente[]> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("fotos_expedientes")
    .select("*")
    .eq("expediente_id", expedienteId)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al obtener fotos del expediente:", error);
    return [];
  }
  return (data || []) as FotoExpediente[];
}

/** Sube fotos al bucket y las registra en la BD para el expediente. */
export async function subirFotosExpediente(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseServidor();
  const expedienteId = formData.get("expedienteId") as string | null;
  const archivos = formData.getAll("archivos") as File[];

  if (!expedienteId) return { ok: false, error: "Falta expedienteId." };
  if (!archivos || archivos.length === 0) return { ok: false, error: "No se adjuntaron fotos." };

  for (const archivo of archivos) {
    if (!archivo || archivo.size === 0) continue;
    const cleanName = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${expedienteId}/${Date.now()}-${cleanName}`;
    const buffer = Buffer.from(await archivo.arrayBuffer());

    let publicUrl = "";

    const { data: uploadData, error: uploadError } = await sb.storage
      .from("expedientes-fotos")
      .upload(path, buffer, {
        contentType: archivo.type || "image/jpeg",
        upsert: true,
      });

    if (!uploadError && uploadData) {
      const { data: urlData } = sb.storage
        .from("expedientes-fotos")
        .getPublicUrl(uploadData.path);
      publicUrl = urlData.publicUrl;
    } else {
      const base64 = buffer.toString("base64");
      publicUrl = `data:${archivo.type || "image/jpeg"};base64,${base64}`;
    }

    await sb.from("fotos_expedientes").insert({
      expediente_id: expedienteId,
      url: publicUrl,
      nombre_archivo: archivo.name,
      rotacion: 0,
    });
  }

  return { ok: true };
}

/** Actualiza la rotación de una foto (0, 90, 180, 270 grados). */
export async function rotarFotoExpediente(fotoId: string, nuevaRotacion: number): Promise<void> {
  const sb = supabaseServidor();
  await sb
    .from("fotos_expedientes")
    .update({ rotacion: ((nuevaRotacion % 360) + 360) % 360 })
    .eq("id", fotoId);
}

/** Elimina una foto de la galería del expediente. */
export async function eliminarFotoExpediente(fotoId: string): Promise<void> {
  const sb = supabaseServidor();
  const { data: foto } = await sb
    .from("fotos_expedientes")
    .select("url")
    .eq("id", fotoId)
    .maybeSingle();

  if (foto?.url && foto.url.includes("expedientes-fotos/")) {
    const match = foto.url.match(/expedientes-fotos\/(.+)$/);
    if (match) {
      await sb.storage.from("expedientes-fotos").remove([match[1]]);
    }
  }

  await sb.from("fotos_expedientes").delete().eq("id", fotoId);
}

/** Obtiene el proveedor de IA activo desde la base de datos o fallback a process.env. */
export async function obtenerProveedorIA(): Promise<string> {
  const sb = supabaseServidor();
  try {
    const { data } = await sb
      .from("configuracion_agente")
      .select("valor")
      .eq("clave", "ia_proveedor")
      .maybeSingle();
    if (data?.valor) {
      return data.valor.trim();
    }
  } catch (err) {
    console.error("Error al obtener proveedor de IA:", err);
  }
  return process.env.IA_PROVEEDOR || "anthropic";
}

/** Guarda/actualiza el proveedor de IA activo en la base de datos (requiere ser Admin). */
export async function guardarProveedorIA(proveedor: string): Promise<boolean> {
  await requireAdmin();
  if (!["anthropic", "kimi", "ollama"].includes(proveedor)) {
    return false;
  }
  const sb = supabaseServidor();
  const { error } = await sb
    .from("configuracion_agente")
    .upsert({
      clave: "ia_proveedor",
      valor: proveedor,
      updated_at: new Date().toISOString()
    }, { onConflict: "clave" });
  return !error;
}

export interface ExpedienteSeguimiento {
  id: string;
  prospectoId?: string | null;
  clienteNombre: string;
  fraccionamiento: string;
  tipoNegocio: string;
  etapa: string;
  prospectoEstatus?: string;
  fechaCreacion: string;
  proximaAccion: string;
  proximaAccionFecha: string | null;
  proximaAccionTipo: "cita" | "tarea" | "ninguno";
  citaId?: string | null;
  tareaBpmId?: string | null;
  tareaAsesorId?: string | null;
  asesorId?: string | null;
  telefono: string;
  calificacion?: CalificacionProspecto;
}

/** Obtiene los expedientes activos de la operación organizados para seguimiento con su próximo pendiente/acción */
export async function obtenerExpedientesSeguimiento(): Promise<ExpedienteSeguimiento[]> {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);

  const sb = supabaseServidor();
  let query = sb
    .from("expedientes")
    .select("*, asesor:asesor_id(nombre), operador:operador_id(nombre), prospecto:prospecto_id(estatus, calificacion)");

  if (rol === "asesor") {
    query = query.eq("asesor_id", usuario.id);
  } else if (rol === "operaciones") {
    query = query.eq("operador_id", usuario.id);
  }

  // Filtrar fuera los expedientes marcados como perdidos
  query = query.neq("etapa", "perdido");

  const { data: exps, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const expedientesFilas = exps ?? [];
  const result: ExpedienteSeguimiento[] = [];

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const expIds = expedientesFilas.map(e => e.id);

  // Obtener citas futuras (por expediente_id o por prospecto_id)
  let citasFuturas: any[] = [];
  if (expIds.length > 0) {
    const prospectoIds = expedientesFilas.map(e => e.prospecto_id).filter(Boolean);
    let queryCitas = sb
      .from("agenda_citas")
      .select("*")
      .gte("fecha", hoy)
      .neq("estado", "cancelada");

    if (prospectoIds.length > 0) {
      queryCitas = queryCitas.or(`expediente_id.in.(${expIds.join(",")}),prospecto_id.in.(${prospectoIds.join(",")})`);
    } else {
      queryCitas = queryCitas.in("expediente_id", expIds);
    }

    const { data: citas } = await queryCitas
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true });
    citasFuturas = citas || [];
  }

  // Obtener tareas de asesor_tasks pendientes
  let tareasPendientes: any[] = [];
  if (expIds.length > 0) {
    const { data: tareas } = await sb
      .from("asesor_tasks")
      .select(`
        *,
        enrollment:sequence_enrollments(expediente_id)
      `)
      .eq("status", "pendiente")
      .order("agendada_para", { ascending: true });
    tareasPendientes = (tareas || []).filter(t => t.enrollment?.expediente_id && expIds.includes(t.enrollment.expediente_id));
  }

  // Obtener tareas de BPM pendientes
  let bpmTareasPendientes: any[] = [];
  if (expIds.length > 0) {
    const { data: bpmTareas } = await sb
      .from("bpm_expediente_tareas")
      .select("*")
      .in("expediente_id", expIds)
      .eq("estado", "pendiente")
      .order("agendada_para", { ascending: true });
    bpmTareasPendientes = bpmTareas || [];
  }

  const tipoNegocioLabels: Record<string, string> = {
    "traspaso_compra": "Traspaso / Compra",
    "compra": "Traspaso / Compra",
    "promocion_venta": "Promoción de Venta",
    "venta": "Promoción de Venta",
    "solo_tramite": "Solo Trámite",
    "tramite": "Solo Trámite",
    "construccion": "Construcción / Obra",
    "obra": "Construcción / Obra",
    "construccion-remodelacion": "Remodelación",
    "construccion_remodelacion": "Remodelación",
    "remodelacion": "Remodelación",
    "construccion-impermeabilizacion": "Impermeabilización",
    "construccion_impermeabilizacion": "Impermeabilización",
    "impermeabilizacion": "Impermeabilización",
  };

  const etapaLabels: Record<string, string> = {
    "captacion": "Captación",
    "analisis": "Análisis y Validación",
    "documentacion": "Integración de Expediente",
    "firma": "Firma de Contrato",
    "espera-aprobacion": "En espera de Aprobación",
    "pago": "Trámite de Pago",
    "entregado": "Entregado",
    "cotizacion": "Cotización en preparación",
    "visita": "Visita Técnica",
    "propuesta-aceptada": "Propuesta Aceptada",
    "venta": "Venta Concluida",
    "perdido": "Perdido"
  };

  for (const e of expedientesFilas) {
    const cita = citasFuturas.find(c => c.expediente_id === e.id || (e.prospecto_id && c.prospecto_id === e.prospecto_id));
    const bpmTarea = bpmTareasPendientes.find(t => t.expediente_id === e.id);
    const tarea = tareasPendientes.find(t => t.enrollment?.expediente_id === e.id);

    let proximaAccion = "💬 Seguimiento ordinario (Sin tareas agendadas)";
    let proximaAccionFecha: string | null = null;
    let proximaAccionTipo: "cita" | "tarea" | "ninguno" = "ninguno";

    if (cita) {
      const tipoLabel = 
        cita.tipo_cita === "inspeccion" ? "🔍 Inspección" : 
        cita.tipo_cita === "instalacion" ? "🛠️ Instalación" : 
        cita.tipo_cita === "llamada" ? "📞 Llamada" : "📅 Cita";
      proximaAccion = `${tipoLabel}: ${cita.fecha} de ${cita.hora_inicio.slice(0, 5)} a ${cita.hora_fin.slice(0, 5)} hrs`;
      proximaAccionFecha = `${cita.fecha}T${cita.hora_inicio}`;
      proximaAccionTipo = "cita";
    } else if (bpmTarea) {
      proximaAccion = `⚡ BPM: ${bpmTarea.titulo}`;
      proximaAccionFecha = bpmTarea.agendada_para;
      proximaAccionTipo = "tarea";
    } else if (tarea) {
      proximaAccion = `⚡ Tarea: ${tarea.tipo} - "${tarea.notes || tarea.notas || 'Llamar al cliente'}"`;
      proximaAccionFecha = tarea.agendada_para;
      proximaAccionTipo = "tarea";
    }

    const nombreCompleto = [e.cliente, e.primer_apellido, e.segundo_apellido].filter(Boolean).join(" ");
    const prospectoData = e.prospecto as any;
    const prospectoEstatusRaw = prospectoData?.estatus || prospectoData?.etapa || e.prospecto_estatus || "En seguimiento";

    result.push({
      id: e.id,
      prospectoId: e.prospecto_id || null,
      clienteNombre: nombreCompleto,
      fraccionamiento: e.fraccionamiento || "No especificado",
      tipoNegocio: tipoNegocioLabels[e.tipo_negocio] || e.tipo_negocio || "Otro",
      etapa: etapaLabels[e.etapa] || e.etapa || "Sin etapa",
      prospectoEstatus: prospectoEstatusRaw,
      fechaCreacion: e.created_at,
      proximaAccion,
      proximaAccionFecha,
      proximaAccionTipo,
      citaId: cita ? cita.id : null,
      tareaBpmId: bpmTarea ? bpmTarea.id : null,
      tareaAsesorId: tarea ? tarea.id : null,
      asesorId: e.asesor_id || null,
      telefono: e.telefono || "",
      calificacion: (e.calificacion || prospectoData?.calificacion || "frio") as CalificacionProspecto,
    });
  }

  return result;
}

/**
 * Versión segura de actualizarExpediente para uso desde el cliente.
 * Captura el error internamente y lo devuelve como `{ ok: false, error: string }`
 * para que el mensaje real llegue al cliente sin ser sanitizado por Next.js en producción.
 */
export async function actualizarExpedienteSeguro(
  id: string,
  datos: DatosExpediente,
): Promise<{ ok: true; expediente: Expediente } | { ok: false; error: string }> {
  try {
    const expediente = await actualizarExpediente(id, datos);
    return { ok: true, expediente };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Error desconocido al guardar." };
  }
}

/** Cambia la calificación / prioridad de un expediente y sincroniza con su prospecto enlazado */
export async function cambiarCalificacionExpediente(
  expedienteId: string,
  calificacion: CalificacionProspecto,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const usuario = await usuarioActual();
    if (!usuario) return { ok: false, error: "No autorizado." };

    const sb = supabaseServidor();
    const { data: exp, error } = await sb
      .from("expedientes")
      .update({ calificacion })
      .eq("id", expedienteId)
      .select("prospecto_id")
      .single();

    if (error) return { ok: false, error: error.message };

    // Sincronización explícita con el prospecto si existe
    if (exp?.prospecto_id) {
      await sb
        .from("prospectos")
        .update({ calificacion })
        .eq("id", exp.prospecto_id);
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al cambiar la calificación." };
  }
}
