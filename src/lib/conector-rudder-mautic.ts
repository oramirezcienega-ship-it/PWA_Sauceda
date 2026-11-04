/**
 * Conector RudderStack -> Mautic para sincronización de Prospectos y Expedientes.
 * 
 * Envía eventos estándar 'identify' hacia el pipeline de RudderStack en producción
 * (o staging), asegurando que Mautic mantenga los datos de contacto, tipo de negocio,
 * etapa del embudo, estatus y la bandera de descalificación en tiempo real.
 */

export interface DatosConectorMautic {
  userId: string;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
  origen?: string | null;
  tipo_negocio?: string | null;
  etapa?: string | null;
  estatus?: string | null;
  no_viable?: boolean | null;
  ia_pausada?: boolean | null;
  descalificado?: boolean | null;
  calificacion?: string | null;
  tags?: string[];
}

export function esContactoDescalificado(params: {
  etapa?: string | null;
  estatus?: string | null;
  no_viable?: boolean | null;
  ia_pausada?: boolean | null;
  descalificado?: boolean | null;
  calificacion?: string | null;
}): boolean {
  if (params.descalificado === true) {
    return true;
  }
  const etapaLimpia = (params.etapa || "").toLowerCase();
  const estatusLimpio = (params.estatus || "").toLowerCase();
  const califLimpia = (params.calificacion || "").toLowerCase();
  
  return (
    Boolean(params.descalificado) ||
    etapaLimpia === "perdido" ||
    etapaLimpia === "descalificado" ||
    etapaLimpia === "no_viable" ||
    etapaLimpia === "no-viable" ||
    etapaLimpia === "fuera_de_zona" ||
    etapaLimpia === "fuera-de-zona" ||
    estatusLimpio === "no_viable" ||
    estatusLimpio === "descalificado" ||
    estatusLimpio === "sin_contacto" ||
    califLimpia === "descalificado" ||
    Boolean(params.no_viable) ||
    Boolean(params.ia_pausada)
  );
}

export async function sincronizarConectorMautic(
  datos: DatosConectorMautic
): Promise<boolean> {
  try {
    const esStaging =
      process.env.SITE_URL?.includes("sslip.io") ||
      process.env.SITE_URL?.includes("192.168.100.253");
      
    const rudderUrl =
      process.env.RUDDERSTACK_URL ||
      (esStaging
        ? "http://192.168.100.253:51700/v1/identify"
        : "http://192.168.100.253:52700/v1/identify");

    const descalificado = esContactoDescalificado(datos);
    // En pausa: se excluye de campañas (descalificado=1) mientras dure, sin marcarlo como descalificado
    // de forma permanente; al reactivarse vuelve a sincronizarse con su etapa normal.
    const enPausa = (datos.etapa || "").toLowerCase() === "en_pausa";

    // Construir lista de tags limpia para Mautic
    const tagsList = new Set<string>(datos.tags || []);
    if (datos.tipo_negocio) {
      tagsList.add(datos.tipo_negocio);
      if (datos.tipo_negocio === "construccion-impermeabilizacion") {
        tagsList.add("impermeabilizacion");
      }
    }
    if (descalificado) {
      tagsList.add("descalificado");
    }
    if (enPausa) {
      tagsList.add("en_pausa");
    }

    const rawPhone = (datos.phone || "").replace(/\D/g, "");
    const cleanPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : "";
    const rawEmail = (datos.email || "").trim().toLowerCase();
    const cleanEmail = rawEmail.includes("@") && rawEmail.includes(".") ? rawEmail : "";

    const traits: Record<string, any> = {
      firstname: (datos.firstname || "").trim(),
      lastname: (datos.lastname || "").trim(),
      origen: datos.origen || "",
      tipo_negocio: datos.tipo_negocio || "otro",
      etapa: datos.etapa || "nuevo-lead",
      estatus: datos.estatus || "nuevo",
      calificacion: descalificado ? "descalificado" : (datos.calificacion || "templado"),
      no_viable: Boolean(datos.no_viable),
      ia_pausada: Boolean(datos.ia_pausada),
      descalificado: descalificado || enPausa ? 1 : 0,
      en_pausa: enPausa ? 1 : 0,
      tags: Array.from(tagsList).join(","),
    };

    if (cleanPhone) traits.phone = cleanPhone;
    if (cleanEmail) traits.email = cleanEmail;

    const payload = {
      userId: datos.userId,
      type: "identify",
      traits: traits,
      context: {
        library: {
          name: "crm-sauceda",
          version: "2.0.0",
        },
      },
    };

    const basicAuth = Buffer.from("crm_source:").toString("base64");

    const res = await fetch(rudderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[Conector Mautic] RudderStack devolvió HTTP ${res.status} para ${datos.userId}`);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error(`[Conector Mautic] Error sincronizando ${datos.userId}:`, err?.message || err);
    return false;
  }
}


/**
 * Pausa / desenrola automáticamente a un contacto en Mautic cuando este
 * responde o interactúa en WhatsApp / CRM, cancelando secuencias programadas
 * para evitar mensajes cruzados mientras habla con un asesor o Sofía.
 */
export async function pausarMauticPorInteraccion(params: {
  telefono: string;
  prospectoId?: string | null;
  expedienteId?: string | null;
  motivo?: string;
}): Promise<boolean> {
  try {
    const rawDigits = (params.telefono || "").replace(/\D/g, "");
    const tel10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
    if (!tel10 || tel10.length < 8) return false;

    const motivo = params.motivo || "Respuesta / interacción de cliente en WhatsApp";

    // 1. Notificar al dispatcher de campañas (webhook_receiver en Proxmox) para desenrolar en Mautic MySQL
    const dispatcherUrl = (process.env.MAUTIC_DISPATCHER_URL || "http://192.168.100.253:52900").replace(/\/$/, "");
    try {
      fetch(`${dispatcherUrl}/api/pause-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: tel10,
          motivo,
          prospecto_id: params.prospectoId || null,
          expediente_id: params.expedienteId || null,
        }),
      }).catch((errFetch) => {
        console.warn("[Pausa Mautic] Advertencia al contactar dispatcher:", errFetch?.message || errFetch);
      });
    } catch (errDis) {
      console.warn("[Pausa Mautic] Error invocando dispatcher:", errDis);
    }

    // 2. Marcar como 'en_conversacion' en Supabase mautic_enrolamientos
    try {
      const { supabaseServidor } = await import("@/lib/supabase/server");
      const sb = supabaseServidor();
      const ahoraIso = new Date().toISOString();

      await sb
        .from("mautic_enrolamientos")
        .update({
          estado: "en_conversacion",
          desuscrito_at: ahoraIso,
          notas: `Pausado automáticamente: ${motivo.slice(0, 150)}`,
          updated_at: ahoraIso,
        })
        .ilike("telefono", `%${tel10}%`)
        .eq("estado", "activo");
    } catch (errSup) {
      console.warn("[Pausa Mautic] Error actualizando mautic_enrolamientos en Supabase:", errSup);
    }

    return true;
  } catch (errGlobal) {
    console.error("[Pausa Mautic] Error en pausarMauticPorInteraccion:", errGlobal);
    return false;
  }
}
