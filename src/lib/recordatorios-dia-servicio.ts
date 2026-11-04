import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefono } from "./telefono";
import { MARCA } from "./marca";

export interface CitaRecordatorio {
  id: string;
  tipo_cita: string;
  fecha: string;
  hora_inicio: string;
  hora_fin?: string;
  cliente_nombre: string;
  cliente_telefono: string;
  fraccionamiento?: string | null;
  direccion?: string | null;
  notas?: string | null;
  expediente_id?: string | null;
  servicio_tipo?: string | null;
  perfil_id?: string | null;
  asignados_ids?: string[] | null;
  confirmaciones_equipo?: Record<string, any> | null;
  recordatorio_cliente_enviado_at?: string | null;
  recordatorio_proveedor_enviado_at?: string | null;
}

export interface ResultadoRecordatorio {
  ok: boolean;
  omitido?: boolean;
  motivo?: string;
  messageId?: string;
  canal?: string;
  error?: string;
}

export interface ResumenRecordatoriosDia {
  fecha: string;
  totalCitas: number;
  clientesEnviados: number;
  clientesOmitidos: number;
  clientesErrores: number;
  proveedoresEnviados: number;
  proveedoresOmitidos: number;
  proveedoresErrores: number;
  detalles: Array<{
    citaId: string;
    cliente: string;
    tipoCita: string;
    clienteRes: ResultadoRecordatorio;
    proveedorRes: ResultadoRecordatorio;
  }>;
}

/**
 * Formatea una fecha YYYY-MM-DD en texto amigable anteponiendo "hoy":
 * ej. "hoy sábado, 31 de octubre" o "hoy lunes, 02 de noviembre"
 */
export function formatearFechaHoyLegible(fechaStr: string): string {
  if (!fechaStr) return "hoy";
  const partes = fechaStr.split("-");
  if (partes.length === 3) {
    const año = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const dia = parseInt(partes[2], 10);
    const fechaObj = new Date(año, mes, dia);
    if (!isNaN(fechaObj.getTime())) {
      const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
      const meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
      ];
      return `hoy ${dias[fechaObj.getDay()]}, ${dia} de ${meses[mes]}`;
    }
  }
  return `hoy ${fechaStr}`;
}

/**
 * Formatea horario de inicio (y fin si aplica) a formato 12h legible:
 * ej. "17:30:00" -> "5:30 pm" | "10:00:00" -> "10:00 am"
 */
export function formatearHorarioLegible(horaInicio: string, horaFin?: string): string {
  const formato12 = (h: string) => {
    if (!h) return "";
    const [hhStr, mmStr] = h.split(":");
    const hh = parseInt(hhStr, 10);
    const mm = parseInt(mmStr || "0", 10);
    if (isNaN(hh)) return h;
    const sufijo = hh >= 12 ? "pm" : "am";
    const h12 = hh % 12 || 12;
    return mm === 0 ? `${h12}:00 ${sufijo}` : `${h12}:${mm.toString().padStart(2, "0")} ${sufijo}`;
  };

  const inicio = formato12(horaInicio);
  if (!horaFin || horaFin === horaInicio) return inicio;
  const fin = formato12(horaFin);
  return `${inicio} a ${fin}`;
}

/**
 * Infiere un nombre de servicio limpio y formal a partir del servicio_tipo y las notas.
 */
export function inferirServicioNombre(cita: { servicio_tipo?: string | null; notas?: string | null }): string {
  const notas = (cita.notas || "").toLowerCase();
  const tipo = (cita.servicio_tipo || "").toLowerCase();

  if (notas.includes("calentador") || tipo.includes("calentador")) {
    if (notas.includes("12 tubos")) return "mantenimiento de calentador solar de 12 tubos";
    if (notas.includes("15 tubos")) return "mantenimiento de calentador solar de 15 tubos";
    if (notas.includes("18 tubos")) return "mantenimiento de calentador solar de 18 tubos";
    if (notas.includes("empaques")) return "servicio técnico y cambio de empaques de calentador solar";
    return "mantenimiento preventivo y correctivo de calentador solar";
  }

  if (notas.includes("impermeabili") || tipo.includes("impermeabili")) {
    return "impermeabilización profesional";
  }

  if (notas.includes("concreto") || tipo.includes("concreto") || notas.includes("estampado")) {
    return "concreto estampado y pisos";
  }

  if (notas.includes("pintura") || tipo.includes("pintura")) {
    return "aplicación de pintura y acabados";
  }

  if (notas.includes("plomer") || tipo.includes("plomer")) {
    return "servicio técnico especializado de plomería";
  }

  if (cita.servicio_tipo) {
    return cita.servicio_tipo.replace(/[-_]/g, " ").trim();
  }

  return "instalación y servicio técnico";
}

/**
 * Resuelve el nombre del responsable técnico o asesor que visita al cliente.
 * Prioriza el nombre formal del proveedor registrado (ej. Clemente López).
 */
export async function resolverResponsableCita(
  sb: SupabaseClient,
  cita: CitaRecordatorio
): Promise<{ nombre: string; proveedorId: string | null; asesorId: string | null }> {
  // 1. Intentar resolver por Orden de Trabajo ligada al expediente
  if (cita.expediente_id) {
    const { data: ots } = await sb
      .from("ordenes_trabajo")
      .select("id, proveedor_id, asesor_responsable_id, asesor_ejecutor_id")
      .eq("expediente_id", cita.expediente_id)
      .order("created_at", { ascending: false })
      .limit(1);

    const ot = ots?.[0];
    if (ot?.proveedor_id) {
      const { data: prov } = await sb
        .from("proveedores")
        .select("id, nombre, contacto_nombre, razon_social")
        .eq("id", ot.proveedor_id)
        .maybeSingle();

      if (prov) {
        const formal = prov.contacto_nombre?.trim() || prov.razon_social?.trim() || prov.nombre;
        return { nombre: formal, proveedorId: prov.id, asesorId: null };
      }
    }
  }

  // 2. Si las notas mencionan a un proveedor específico (ej: Clemente Plomero / Clemente López)
  const notas = cita.notas || "";
  if (/clemente/i.test(notas)) {
    const { data: prov } = await sb
      .from("proveedores")
      .select("id, nombre, contacto_nombre, razon_social")
      .ilike("nombre", "%Clemente%")
      .limit(1)
      .maybeSingle();

    if (prov) {
      const formal = prov.contacto_nombre?.trim() || prov.razon_social?.trim() || prov.nombre;
      return { nombre: formal, proveedorId: prov.id, asesorId: null };
    }
  }

  // 3. Resolver por asesor/técnico asignado internamente
  const asesorId = (cita.asignados_ids && cita.asignados_ids.length > 0)
    ? cita.asignados_ids[0]
    : cita.perfil_id;

  if (asesorId) {
    const { data: perfil } = await sb
      .from("perfiles")
      .select("id, nombre")
      .eq("id", asesorId)
      .maybeSingle();

    if (perfil?.nombre) {
      return { nombre: perfil.nombre.trim(), proveedorId: null, asesorId: perfil.id };
    }
  }

  // 4. Fallback genérico institucional
  const fallback = cita.tipo_cita === "instalacion"
    ? "Técnico especialista SAUCEDA"
    : "Asesor técnico SAUCEDA";

  return { nombre: fallback, proveedorId: null, asesorId: null };
}

/**
 * Resuelve los datos del proveedor y la OT asociada para notificarle el recordatorio.
 */
export async function resolverDatosProveedorCita(
  sb: SupabaseClient,
  cita: CitaRecordatorio
): Promise<{
  proveedor: {
    id: string;
    nombre: string;
    contactoNombre: string;
    telefono: string;
    telegramChatId?: string | null;
  } | null;
  ordenTrabajo: {
    id: string;
    folio: string;
    costoProveedor?: number | null;
    titulo?: string | null;
  } | null;
}> {
  let proveedorId: string | null = null;
  let otData: any = null;

  if (cita.expediente_id) {
    const { data: ots } = await sb
      .from("ordenes_trabajo")
      .select("id, folio, proveedor_id, costo_proveedor, titulo")
      .eq("expediente_id", cita.expediente_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (ots && ots.length > 0) {
      otData = ots[0];
      proveedorId = otData.proveedor_id || null;
    }
  }

  // Si no vino de la OT, buscar por mención en notas
  if (!proveedorId && cita.notas && /clemente/i.test(cita.notas)) {
    const { data: prov } = await sb
      .from("proveedores")
      .select("id")
      .ilike("nombre", "%Clemente%")
      .limit(1)
      .maybeSingle();
    proveedorId = prov?.id || null;
  }

  if (!proveedorId) {
    return { proveedor: null, ordenTrabajo: otData };
  }

  const { data: prov } = await sb
    .from("proveedores")
    .select("id, nombre, contacto_nombre, razon_social, whatsapp, telefono, telegram_chat_id")
    .eq("id", proveedorId)
    .maybeSingle();

  if (!prov) {
    return { proveedor: null, ordenTrabajo: otData };
  }

  const tel = normalizarTelefono(prov.whatsapp || prov.telefono || "");
  const contacto = prov.contacto_nombre?.trim() || prov.razon_social?.trim() || prov.nombre;

  return {
    proveedor: {
      id: prov.id,
      nombre: prov.nombre,
      contactoNombre: contacto,
      telefono: tel,
      telegramChatId: prov.telegram_chat_id || null,
    },
    ordenTrabajo: otData,
  };
}

/**
 * Envía el recordatorio oficial del día al CLIENTE usando plantillas de Meta Cloud API
 * en categoría UTILITY (para saltar la restricción de 24h y abrir la ventana).
 */
export async function enviarRecordatorioDiaCliente(
  sb: SupabaseClient,
  cita: CitaRecordatorio,
  options: { forzar?: boolean } = {}
): Promise<ResultadoRecordatorio> {
  const telCliente = normalizarTelefono(cita.cliente_telefono || "");
  if (!telCliente || telCliente.length < 10) {
    return { ok: false, omitido: true, motivo: "telefono_invalido" };
  }

  // Validar si ya se envió hoy (evitar spam si el cron corre varias veces)
  const conf = cita.confirmaciones_equipo || {};
  const yaEnviado = cita.recordatorio_cliente_enviado_at || conf.recordatorio_cliente_enviado_at;
  if (yaEnviado && !options.forzar) {
    return { ok: true, omitido: true, motivo: "ya_enviado_previamente" };
  }

  // Protección estricta de descanso: NUNCA enviar de madrugada ni fuera de horario comercial (08:00 AM a 08:00 PM México)
  if (!options.forzar) {
    const ahoraMx = new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const horaActual = parseInt(ahoraMx, 10);
    if (horaActual < 8 || horaActual >= 20) {
      return {
        ok: false,
        omitido: true,
        motivo: `fuera_horario_comercial_${horaActual}h`,
      };
    }
  }

  // Solo aplica para citas de tipo instalación o inspección técnica
  if (cita.tipo_cita !== "instalacion" && cita.tipo_cita !== "inspeccion") {
    return { ok: false, omitido: true, motivo: `tipo_cita_no_aplica_${cita.tipo_cita}` };
  }

  const { nombre: responsableNombre } = await resolverResponsableCita(sb, cita);
  const primerNombre = (cita.cliente_nombre || "Cliente").trim().split(/\s+/)[0];
  const fechaLegible = formatearFechaHoyLegible(cita.fecha);
  const horarioStr = formatearHorarioLegible(cita.hora_inicio, cita.hora_fin);
  const telContacto = MARCA.whatsappTexto || "477 465 4700";
  const { enviarWhatsAppPlantilla } = await import("./whatsapp");

  let resWa: { ok: boolean; error?: string; messageId?: string } = { ok: false };
  let plantillaUsada = "";

  if (cita.tipo_cita === "instalacion") {
    plantillaUsada = "confirmacion_instalacion";
    const servicioNombre = inferirServicioNombre(cita);
    const parametros = [
      primerNombre,
      servicioNombre,
      fechaLegible,
      horarioStr,
      responsableNombre,
      telContacto,
    ];

    // Intentar con es_MX y fallback a es
    resWa = await enviarWhatsAppPlantilla(telCliente, plantillaUsada, "es_MX", parametros);
    if (!resWa.ok) {
      resWa = await enviarWhatsAppPlantilla(telCliente, plantillaUsada, "es", parametros);
    }
  } else if (cita.tipo_cita === "inspeccion") {
    plantillaUsada = "confirmacion_inspeccion";
    const parametros = [
      primerNombre,
      fechaLegible,
      horarioStr,
      responsableNombre,
      telContacto,
    ];

    resWa = await enviarWhatsAppPlantilla(telCliente, plantillaUsada, "es_MX", parametros);
    if (!resWa.ok) {
      resWa = await enviarWhatsAppPlantilla(telCliente, plantillaUsada, "es", parametros);
    }
  }

  const ahoraIso = new Date().toISOString();

  // Registrar en bitácora de mensajes de WhatsApp
  try {
    const textoResumen = `[Plantilla Recordatorio: ${plantillaUsada}] ¡Hola ${primerNombre}! Te recordamos tu ${cita.tipo_cita} hoy (${fechaLegible} a las ${horarioStr}) con ${responsableNombre}.`;
    await sb.from("mensajes_whatsapp").insert({
      telefono: telCliente,
      texto: textoResumen,
      direccion: "out",
      estado: resWa.ok ? "enviado" : "error",
      agente: "recordatorio_dia_servicio",
      wa_message_id: resWa.messageId || null,
      error_detalle: resWa.error || null,
    });
  } catch (errBit) {
    console.warn("[Recordatorio Cliente] No se pudo registrar en mensajes_whatsapp:", errBit);
  }

  // Actualizar bandera en agenda_citas (tanto en confirmaciones_equipo como en columna si existe)
  if (resWa.ok) {
    try {
      const nuevoConf = {
        ...conf,
        recordatorio_cliente_enviado_at: ahoraIso,
        recordatorio_cliente_plantilla: plantillaUsada,
        recordatorio_cliente_wa_id: resWa.messageId || null,
      };

      const updatePayload: Record<string, any> = {
        confirmaciones_equipo: nuevoConf,
      };

      // Intentar actualizar también la columna directa si está presente
      try {
        await sb
          .from("agenda_citas")
          .update({
            ...updatePayload,
            recordatorio_cliente_enviado_at: ahoraIso,
          })
          .eq("id", cita.id);
      } catch {
        // Fallback solo a confirmaciones_equipo
        await sb.from("agenda_citas").update(updatePayload).eq("id", cita.id);
      }
    } catch (errUpd) {
      console.warn("[Recordatorio Cliente] Error al guardar timestamp de recordatorio:", errUpd);
    }
  }

  return {
    ok: resWa.ok,
    messageId: resWa.messageId,
    canal: `meta_template:${plantillaUsada}`,
    error: resWa.error,
  };
}

/**
 * Envía el recordatorio oficial del día al PROVEEDOR combinando:
 * 1. Plantilla oficial aprobada Meta (aviso_proveedor).
 * 2. Evolution API con la ficha operativa completa (Maps, link de WhatsApp cliente, etc.).
 * 3. Telegram si el proveedor tiene telegram_chat_id configurado.
 */
export async function enviarRecordatorioDiaProveedor(
  sb: SupabaseClient,
  cita: CitaRecordatorio,
  options: { forzar?: boolean } = {}
): Promise<ResultadoRecordatorio> {
  const conf = cita.confirmaciones_equipo || {};
  const yaEnviado = cita.recordatorio_proveedor_enviado_at || conf.recordatorio_proveedor_enviado_at;
  if (yaEnviado && !options.forzar) {
    return { ok: true, omitido: true, motivo: "ya_enviado_previamente" };
  }

  // Protección estricta de descanso al proveedor: no enviar de madrugada (solo 08:00 AM a 08:00 PM México)
  if (!options.forzar) {
    const ahoraMx = new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const horaActual = parseInt(ahoraMx, 10);
    if (horaActual < 8 || horaActual >= 20) {
      return {
        ok: false,
        omitido: true,
        motivo: `fuera_horario_comercial_${horaActual}h`,
      };
    }
  }

  const { proveedor, ordenTrabajo } = await resolverDatosProveedorCita(sb, cita);
  if (!proveedor || !proveedor.telefono) {
    return { ok: false, omitido: true, motivo: "sin_proveedor_asignado" };
  }

  const provNombre = proveedor.contactoNombre.split(/\s+/)[0] || proveedor.contactoNombre;
  const clienteNombre = cita.cliente_nombre || "Cliente";
  const horarioStr = formatearHorarioLegible(cita.hora_inicio, cita.hora_fin);
  const ubicacion = [cita.fraccionamiento, cita.direccion].filter(Boolean).join(", ") || "Dirección en expediente";
  const folioOT = ordenTrabajo?.folio || cita.expediente_id || "Servicio Programado";
  const servicioNombre = inferirServicioNombre(cita);
  const telClienteLimpio = normalizarTelefono(cita.cliente_telefono || "");

  const queryMaps = encodeURIComponent(ubicacion);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${queryMaps}`;

  // 1. Mensaje Operativo Enriquecido para Evolution API y Telegram
  const textoOperativo = [
    `⏰ *RECORDATORIO DE SERVICIO HOY · SAUCEDA*`,
    ``,
    `Hola ${provNombre}, te recordamos los datos del servicio programado para hoy:`,
    `📄 Folio: *${folioOT}*`,
    `🛠️ Servicio: ${servicioNombre}`,
    `⏰ Horario: *${horarioStr}*`,
    `👤 Cliente: *${clienteNombre}*`,
    `📱 WhatsApp Cliente: https://wa.me/52${telClienteLimpio.slice(-10)}`,
    `📍 Ubicación: ${ubicacion}`,
    `🗺️ Ver en Google Maps: ${mapsUrl}`,
    ordenTrabajo?.costoProveedor ? `💵 Pago acordado mano de obra: $${ordenTrabajo.costoProveedor.toLocaleString("es-MX")}` : null,
    cita.notas ? `📝 Notas: ${cita.notas}` : null,
    ``,
    `Por favor confírmanos de recibido respondiendo a este mensaje cuando salgas en camino. ¡Éxito en la jornada! 🤝`,
  ].filter(Boolean).join("\n");

  // 2. Resumen condensado para plantilla oficial de Meta 'aviso_proveedor' ({{2}})
  const resumenMeta = `te recordamos que hoy tienes servicio a las ${horarioStr} con ${clienteNombre} en ${ubicacion} [${folioOT}].`;

  let exito = false;
  let canalUsado = "";
  let errorDetalle = "";

  // Despacho vía módulo oficial de proveedores (maneja Evolution API, Telegram y fallback de plantilla)
  try {
    const { enviarWhatsAppProveedor } = await import("./whatsapp-proveedores");
    const resProv = await enviarWhatsAppProveedor(sb, {
      proveedorId: proveedor.id,
      texto: textoOperativo,
      resumen: resumenMeta,
      agente: "recordatorio_dia_servicio",
    });

    if (resProv.ok) {
      exito = true;
      canalUsado = resProv.via || "evolution_o_plantilla";
    } else {
      errorDetalle = resProv.error || "error_envio_proveedor";
    }
  } catch (errProv: any) {
    console.error("[Recordatorio Proveedor] Error al invocar enviarWhatsAppProveedor:", errProv);
    errorDetalle = errProv?.message || String(errProv);
  }

  const ahoraIso = new Date().toISOString();

  // Actualizar bandera en agenda_citas
  if (exito) {
    try {
      const nuevoConf = {
        ...conf,
        recordatorio_proveedor_enviado_at: ahoraIso,
        recordatorio_proveedor_canal: canalUsado,
        recordatorio_proveedor_id: proveedor.id,
      };

      const updatePayload: Record<string, any> = {
        confirmaciones_equipo: nuevoConf,
      };

      try {
        await sb
          .from("agenda_citas")
          .update({
            ...updatePayload,
            recordatorio_proveedor_enviado_at: ahoraIso,
          })
          .eq("id", cita.id);
      } catch {
        await sb.from("agenda_citas").update(updatePayload).eq("id", cita.id);
      }
    } catch (errUpd) {
      console.warn("[Recordatorio Proveedor] Error al guardar timestamp en agenda_citas:", errUpd);
    }
  }

  return {
    ok: exito,
    canal: canalUsado,
    error: errorDetalle || undefined,
  };
}

/**
 * Procesa todas las citas del día actual (zona horaria México) que correspondan a
 * instalación o inspección técnica, enviando recordatorio a cliente y proveedor.
 */
export async function procesarRecordatoriosDiaServicio(
  sb: SupabaseClient,
  fechaFiltro?: string,
  options: { forzar?: boolean } = {}
): Promise<ResumenRecordatoriosDia> {
  // Obtener fecha hoy en México si no fue especificada
  const fechaHoy = fechaFiltro || new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

  const { data: citas = [], error } = await sb
    .from("agenda_citas")
    .select("*")
    .eq("fecha", fechaHoy)
    .in("tipo_cita", ["instalacion", "inspeccion"])
    .neq("estado", "cancelada")
    .order("hora_inicio", { ascending: true });

  if (error) {
    console.error("[Recordatorios Día Servicio] Error al consultar citas:", error);
  }

  const resumen: ResumenRecordatoriosDia = {
    fecha: fechaHoy,
    totalCitas: citas?.length || 0,
    clientesEnviados: 0,
    clientesOmitidos: 0,
    clientesErrores: 0,
    proveedoresEnviados: 0,
    proveedoresOmitidos: 0,
    proveedoresErrores: 0,
    detalles: [],
  };

  for (const cita of citas || []) {
    const clienteRes = await enviarRecordatorioDiaCliente(sb, cita as CitaRecordatorio, options);
    if (clienteRes.ok) {
      if (clienteRes.omitido) resumen.clientesOmitidos++;
      else resumen.clientesEnviados++;
    } else {
      if (clienteRes.omitido) resumen.clientesOmitidos++;
      else resumen.clientesErrores++;
    }

    const proveedorRes = await enviarRecordatorioDiaProveedor(sb, cita as CitaRecordatorio, options);
    if (proveedorRes.ok) {
      if (proveedorRes.omitido) resumen.proveedoresOmitidos++;
      else resumen.proveedoresEnviados++;
    } else {
      if (proveedorRes.omitido) resumen.proveedoresOmitidos++;
      else resumen.proveedoresErrores++;
    }

    resumen.detalles.push({
      citaId: cita.id,
      cliente: cita.cliente_nombre,
      tipoCita: cita.tipo_cita,
      clienteRes,
      proveedorRes,
    });
  }

  return resumen;
}
