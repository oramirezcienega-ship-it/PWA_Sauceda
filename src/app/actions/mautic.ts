"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { MauticCampana, EnrolamientoMautic } from "@/lib/types";
import { revalidatePath } from "next/cache";

type ActionResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  aviso?: string;
};

/**
 * Notifica a Mautic (vía API directa o n8n) sobre la inscripción o retiro de un contacto.
 */
async function notificarMauticOWebhook(
  accion: "add_contact" | "remove_contact",
  payload: {
    campanaId: string;
    campanaNombre: string;
    telefono: string;
    correo: string;
    nombre: string;
    prospectoId?: string | null;
    expedienteId?: string | null;
  }
) {
  const mauticUrl = (process.env.MAUTIC_URL || "https://mautic.saucedamx.com").replace(/\/$/, "");
  const mauticToken = process.env.MAUTIC_API_TOKEN || process.env.MAUTIC_BEARER_TOKEN;
  const mauticUser = process.env.MAUTIC_API_USERNAME;
  const mauticPass = process.env.MAUTIC_API_PASSWORD;

  let authHeader: string | null = null;
  if (mauticToken) {
    authHeader = `Bearer ${mauticToken}`;
  } else if (mauticUser && mauticPass) {
    authHeader = `Basic ${Buffer.from(`${mauticUser}:${mauticPass}`).toString("base64")}`;
  }

  // 1. Si hay credenciales de Mautic configuradas, invocar la API nativa de Mautic
  if (authHeader) {
    try {
      const endpoint =
        accion === "add_contact"
          ? `${mauticUrl}/api/campaigns/${payload.campanaId}/contact/add`
          : `${mauticUrl}/api/campaigns/${payload.campanaId}/contact/remove`;

      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          phone: payload.telefono,
          email: payload.correo,
          firstname: payload.nombre,
        }),
      });
    } catch (eMautic) {
      console.warn("[Mautic API] Aviso al conectar con Mautic API:", eMautic);
    }
  }

  // 2. Disparar webhook de orquestación en n8n
  const n8nWebhook =
    process.env.N8N_MAUTIC_WEBHOOK_URL ||
    process.env.N8N_MARKETING_WEBHOOK_URL ||
    "https://n8n-staging.saucedamx.com/webhook/publicar-contenido";

  if (n8nWebhook) {
    try {
      await fetch(n8nWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: `mautic_campana_${accion}`,
          campana_id: payload.campanaId,
          campana_nombre: payload.campanaNombre,
          telefono: payload.telefono,
          correo: payload.correo,
          nombre_contacto: payload.nombre,
          prospecto_id: payload.prospectoId || null,
          expediente_id: payload.expedienteId || null,
          fecha: new Date().toISOString(),
          fuente: "CRM Sauceda",
        }),
      });
    } catch (eN8n) {
      console.warn("[Mautic Webhook] Advertencia al notificar n8n:", eN8n);
    }
  }
}

/**
 * Lista todas las campañas de Mautic registradas y activas.
 */
export async function listarCampanasMauticDisponibles(): Promise<ActionResult<MauticCampana[]>> {
  try {
    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("mautic_campanas")
      .select("*")
      .order("nombre", { ascending: true });

    if (error) throw error;

    const campanas: MauticCampana[] = (data || []).map((row: any) => ({
      id: String(row.id),
      nombre: row.nombre,
      descripcion: row.descripcion,
      canal: row.canal || "omnicanal",
      activa: Boolean(row.activa),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, data: campanas };
  } catch (err: any) {
    console.error("Error en listarCampanasMauticDisponibles:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Obtiene el estado de campañas de un contacto (prospecto o expediente),
 * combinando enrolamientos explícitos y mensajes enviados registrados.
 */
export async function obtenerCampanasDeContacto(params: {
  prospectoId?: string | null;
  expedienteId?: string | null;
  telefono?: string | null;
  correo?: string | null;
}): Promise<
  ActionResult<{
    enrolamientos: EnrolamientoMautic[];
    campanasDisponibles: MauticCampana[];
  }>
> {
  try {
    const sb = supabaseServidor();
    const { prospectoId, expedienteId, telefono, correo } = params;

    // 1. Obtener catálogo de campañas
    const resCampanas = await listarCampanasMauticDisponibles();
    const campanasDisponibles = resCampanas.data || [];
    const mapCampanas = new Map<string, MauticCampana>(
      campanasDisponibles.map((c) => [c.id, c])
    );
    // Mapeo por nombre normalizado para cruzar con campana_origen de mensajes_whatsapp
    const mapCampanasPorNombre = new Map<string, MauticCampana>(
      campanasDisponibles.map((c) => [c.nombre.trim().toLowerCase(), c])
    );

    // 2. Construir variantes de teléfono para búsqueda exhaustiva
    const variantes = telefono ? variantesTelefono(telefono) : [];

    // 3. Consultar enrolamientos en mautic_enrolamientos
    let queryEnrol = sb.from("mautic_enrolamientos").select("*");

    const orClauses: string[] = [];
    if (prospectoId) orClauses.push(`prospecto_id.eq.${prospectoId}`);
    if (expedienteId) orClauses.push(`expediente_id.eq.${expedienteId}`);
    if (variantes.length > 0) {
      orClauses.push(`telefono.in.(${variantes.join(",")})`);
    }
    if (correo && correo.includes("@")) {
      orClauses.push(`correo.ilike.${correo.trim()}`);
    }

    let enrolamientosDb: any[] = [];
    if (orClauses.length > 0) {
      const { data, error } = await queryEnrol.or(orClauses.join(","));
      if (!error && data) {
        enrolamientosDb = data;
      }
    }

    // 4. Consultar trazabilidad de mensajes de campaña en mensajes_whatsapp
    let mensajesCampana: any[] = [];
    if (variantes.length > 0 || prospectoId || expedienteId) {
      let queryMsg = sb
        .from("mensajes_whatsapp")
        .select("id, texto, campana_origen, created_at, entregado_at, leido_at, estado")
        .not("campana_origen", "is", null)
        .order("created_at", { ascending: false });

      const msgOrClauses: string[] = [];
      if (variantes.length > 0) msgOrClauses.push(`telefono.in.(${variantes.join(",")})`);
      if (prospectoId) msgOrClauses.push(`prospecto_id.eq.${prospectoId}`);
      if (expedienteId) msgOrClauses.push(`expediente_id.eq.${expedienteId}`);

      if (msgOrClauses.length > 0) {
        const { data: dataMsg } = await queryMsg.or(msgOrClauses.join(",")).limit(30);
        mensajesCampana = dataMsg || [];
      }
    }

    // 5. Agrupar el último mensaje por campaña
    const mapUltimoMensaje = new Map<
      string,
      {
        texto: string;
        at: string;
        estado: string;
        leidoAt?: string | null;
        entregadoAt?: string | null;
      }
    >();

    for (const m of mensajesCampana) {
      const key = (m.campana_origen || "").trim().toLowerCase();
      if (key && !mapUltimoMensaje.has(key)) {
        mapUltimoMensaje.set(key, {
          texto: m.texto,
          at: m.created_at,
          estado: m.estado,
          leidoAt: m.leido_at,
          entregadoAt: m.entregado_at,
        });
      }
    }

    // 6. Armar listado consolidado de enrolamientos
    const enrolamientosConsolidados: EnrolamientoMautic[] = [];
    const campanasRegistradas = new Set<string>();

    for (const row of enrolamientosDb) {
      campanasRegistradas.add(row.campana_id);
      const camp = mapCampanas.get(row.campana_id);
      const nombreCamp = camp?.nombre || row.campana_nombre || "Campaña Mautic";
      const keyNombre = nombreCamp.trim().toLowerCase();
      const msgInfo = mapUltimoMensaje.get(keyNombre);

      enrolamientosConsolidados.push({
        id: row.id,
        campanaId: row.campana_id,
        campanaNombre: nombreCamp,
        campanaDescripcion: camp?.descripcion || null,
        canal: camp?.canal || "omnicanal",
        prospectoId: row.prospecto_id,
        expedienteId: row.expediente_id,
        telefono: row.telefono,
        correo: row.correo,
        nombreContacto: row.nombre_contacto,
        estado: row.estado,
        origenAlta: row.origen_alta,
        enroladoAt: row.enrolado_at,
        desuscritoAt: row.desuscrito_at,
        notas: row.notas,
        ultimoMensajeTexto: msgInfo?.texto || row.ultimo_mensaje_texto || null,
        ultimoMensajeAt: msgInfo?.at || row.enrolado_at,
        ultimoMensajeEstado: msgInfo?.estado || null,
        leidoAt: msgInfo?.leidoAt || null,
        entregadoAt: msgInfo?.entregadoAt || null,
      });
    }

    // 7. Si hubo mensajes de campañas que aún no tenían fila en mautic_enrolamientos, incorporarlas
    for (const [keyNombre, msgInfo] of mapUltimoMensaje.entries()) {
      const camp = mapCampanasPorNombre.get(keyNombre);
      const campanaId = camp?.id || `ext_${keyNombre.replace(/\s+/g, "_")}`;

      if (!campanasRegistradas.has(campanaId)) {
        campanasRegistradas.add(campanaId);
        enrolamientosConsolidados.push({
          id: `virtual_${campanaId}`,
          campanaId: campanaId,
          campanaNombre: camp?.nombre || keyNombre,
          campanaDescripcion: camp?.descripcion || "Detectado automáticamente por mensajes enviados",
          canal: camp?.canal || "whatsapp",
          prospectoId: prospectoId || null,
          expedienteId: expedienteId || null,
          telefono: telefono || "",
          correo: correo || "",
          nombreContacto: "",
          estado: "activo",
          origenAlta: "webhook",
          enroladoAt: msgInfo.at,
          ultimoMensajeTexto: msgInfo.texto,
          ultimoMensajeAt: msgInfo.at,
          ultimoMensajeEstado: msgInfo.estado,
          leidoAt: msgInfo.leidoAt || null,
          entregadoAt: msgInfo.entregadoAt || null,
        });
      }
    }

    // Ordenar: primero los activos más recientes
    enrolamientosConsolidados.sort((a, b) => {
      if (a.estado === "activo" && b.estado !== "activo") return -1;
      if (a.estado !== "activo" && b.estado === "activo") return 1;
      return new Date(b.enroladoAt).getTime() - new Date(a.enroladoAt).getTime();
    });

    return {
      success: true,
      data: {
        enrolamientos: enrolamientosConsolidados,
        campanasDisponibles,
      },
    };
  } catch (err: any) {
    console.error("Error en obtenerCampanasDeContacto:", err);
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Inscribe directamente a un prospecto o expediente en una campaña de Mautic.
 */
export async function inscribirContactoEnCampanaMautic(params: {
  campanaId: string;
  prospectoId?: string | null;
  expedienteId?: string | null;
  telefono: string;
  correo?: string;
  nombre?: string;
  notas?: string;
}): Promise<ActionResult<EnrolamientoMautic>> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { campanaId, prospectoId, expedienteId, telefono, correo = "", nombre = "", notas = "" } = params;

    if (!campanaId) throw new Error("Debe seleccionar una campaña de Mautic.");
    if (!telefono && !correo) {
      throw new Error("Se requiere al menos un teléfono o correo electrónico para enrolar al cliente.");
    }

    // 1. Obtener datos de la campaña
    const { data: camp, error: errCamp } = await sb
      .from("mautic_campanas")
      .select("*")
      .eq("id", campanaId)
      .single();

    if (errCamp || !camp) throw new Error("La campaña seleccionada no existe.");

    const telLimpio = normalizarTelefono(telefono || "");
    const correoLimpio = (correo || "").trim().toLowerCase();
    const ahoraIso = new Date().toISOString();

    // 2. Insertar o actualizar registro en mautic_enrolamientos
    const payload = {
      campana_id: camp.id,
      campana_nombre: camp.nombre,
      prospecto_id: prospectoId || null,
      expediente_id: expedienteId || null,
      telefono: telLimpio,
      correo: correoLimpio,
      nombre_contacto: nombre.trim(),
      estado: "activo",
      origen_alta: "crm_manual",
      enrolado_at: ahoraIso,
      desuscrito_at: null,
      notas: notas.trim() || null,
      updated_at: ahoraIso,
    };

    const { data: enrolado, error: errEnrol } = await sb
      .from("mautic_enrolamientos")
      .upsert(payload, {
        onConflict: "campana_id,prospecto_id,telefono",
      })
      .select()
      .single();

    if (errEnrol) throw errEnrol;

    // 3. Notificar a Mautic / n8n
    await notificarMauticOWebhook("add_contact", {
      campanaId: camp.id,
      campanaNombre: camp.nombre,
      telefono: telLimpio,
      correo: correoLimpio,
      nombre: nombre.trim(),
      prospectoId,
      expedienteId,
    });

    if (prospectoId) revalidatePath(`/prospectos/${prospectoId}`);
    if (expedienteId) revalidatePath(`/expediente/${expedienteId}`);

    return {
      success: true,
      aviso: `¡Contacto inscrito exitosamente en la campaña "${camp.nombre}"!`,
      data: {
        id: enrolado.id,
        campanaId: camp.id,
        campanaNombre: camp.nombre,
        campanaDescripcion: camp.descripcion,
        canal: camp.canal || "omnicanal",
        prospectoId: enrolado.prospecto_id,
        expedienteId: enrolado.expediente_id,
        telefono: enrolado.telefono,
        correo: enrolado.correo,
        nombreContacto: enrolado.nombre_contacto,
        estado: enrolado.estado,
        origenAlta: enrolado.origen_alta,
        enroladoAt: enrolado.enrolado_at,
        notas: enrolado.notas,
      },
    };
  } catch (err: any) {
    console.error("Error en inscribirContactoEnCampanaMautic:", err);
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Desuscribe / retira a un prospecto o expediente de una campaña de Mautic.
 */
export async function desuscribirContactoDeCampanaMautic(params: {
  enrolamientoId?: string;
  campanaId: string;
  prospectoId?: string | null;
  expedienteId?: string | null;
  telefono: string;
  correo?: string;
  motivo?: string;
}): Promise<ActionResult<void>> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { enrolamientoId, campanaId, prospectoId, expedienteId, telefono, correo = "", motivo = "Retirado manualmente desde CRM" } = params;

    const ahoraIso = new Date().toISOString();

    // 1. Marcar como desuscrito en Supabase
    if (enrolamientoId && !enrolamientoId.startsWith("virtual_")) {
      await sb
        .from("mautic_enrolamientos")
        .update({
          estado: "desuscrito",
          desuscrito_at: ahoraIso,
          notas: motivo,
          updated_at: ahoraIso,
        })
        .eq("id", enrolamientoId);
    } else {
      // Buscar por campana_id + telefono o prospecto_id
      const query = sb
        .from("mautic_enrolamientos")
        .update({
          estado: "desuscrito",
          desuscrito_at: ahoraIso,
          notas: motivo,
          updated_at: ahoraIso,
        })
        .eq("campana_id", campanaId);

      if (prospectoId) query.eq("prospecto_id", prospectoId);
      else if (telefono) query.in("telefono", variantesTelefono(telefono));

      await query;
    }

    // 2. Notificar a Mautic / n8n para desuscripción
    await notificarMauticOWebhook("remove_contact", {
      campanaId,
      campanaNombre: campanaId,
      telefono: normalizarTelefono(telefono || ""),
      correo: correo.trim().toLowerCase(),
      nombre: "",
      prospectoId,
      expedienteId,
    });

    if (prospectoId) revalidatePath(`/prospectos/${prospectoId}`);
    if (expedienteId) revalidatePath(`/expediente/${expedienteId}`);

    return {
      success: true,
      aviso: "Contacto retirado de la campaña correctamente.",
    };
  } catch (err: any) {
    console.error("Error en desuscribirContactoDeCampanaMautic:", err);
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}
