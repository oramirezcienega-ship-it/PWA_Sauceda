import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leads en pausa ("retomar después").
 *
 * Cuando el cliente pospone ("hasta diciembre", "ahorita no, en enero"), el negocio pasa a
 * la etapa 'en_pausa' con fecha para retomarlo y sus cotizaciones activas quedan 'pausada'.
 * Mientras está en pausa no recibe campañas, retoques ni secuencias (Sofía sí contesta si el
 * cliente escribe). Al llegar la fecha, `despertarLeadsEnPausa` lo regresa a su etapa previa,
 * crea tareas para el asesor y los administradores, avisa por Telegram/notificación y envía
 * la plantilla configurada en `configuracion_agente.plantilla_retomar_pausa`.
 */

export const ETAPA_PAUSA = "en_pausa";

/** Estatus de cotización que se pausan (las cerradas o rechazadas no se tocan). */
const ESTATUS_COTIZACION_PAUSABLES = [
  "borrador",
  "esperando_visita",
  "en_inspeccion",
  "calculando_costo",
  "pendiente_aprobacion",
  "aprobada",
  "enviada",
];

const DIAS_SIN_FECHA = 30;
const DIAS_ANTICIPACION_DEFAULT = 7;
const PLANTILLA_DEFAULT = "retomar_proyecto_pausa";

const SERVICIO_POR_NEGOCIO: Record<string, string> = {
  "construccion-impermeabilizacion": "impermeabilización",
  "construccion-remodelacion": "remodelación",
  "construccion-herreria": "herrería",
  "construccion-piso-estampado": "piso estampado",
  "construccion-mantenimiento-cisternas": "mantenimiento de cisterna",
  "construccion-mantenimiento-tinacos": "mantenimiento de tinacos",
  "construccion-mantenimiento-calentadores": "mantenimiento de calentadores solares",
  "construccion-mantenimiento-postventa": "mantenimiento",
  seguridad: "seguridad y videovigilancia",
  construccion: "construcción",
  traspaso_compra: "venta de tu casa",
  promocion_venta: "venta de tu propiedad",
  solo_tramite: "trámite",
};

/** Fecha de hoy en México (YYYY-MM-DD). */
export function hoyMexico(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

export function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface InferenciaPausa {
  detectado: boolean;
  dias: number;
  fecha: string;
  motivo: string;
  etiquetaCorta: string;
}

/**
 * Infiere de manera inteligente los días y fecha de pausa a partir de lo que dijo el cliente
 * en lenguaje natural mexicano (ej. "una semana más", "en 15 días", "el próximo mes", "hasta diciembre").
 */
export function inferirPausaDesdeTexto(texto: string, fechaBaseISO?: string): InferenciaPausa {
  const base = fechaBaseISO || hoyMexico();
  const raw = (texto || "").toLowerCase().trim();
  const norm = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1 semana / una semana / la próxima semana / semana que viene / semana más / espérame una semana
  if (/(1|una)\s*semana|proxima\s*semana|siguiente\s*semana|semana\s*que\s*viene|semana\s*mas|espera(nos|me)?\s*(1|una)\s*semana|dame\s*(1|una)\s*semana/.test(norm)) {
    const dias = 7;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió esperar una semana",
      etiquetaCorta: "+1 sem (7 días)",
    };
  }

  // 2 semanas / 15 días / quincena
  if (/(2|dos)\s*semanas|15\s*dias|quince\s*dias|quincena|proxima\s*quincena/.test(norm)) {
    const dias = 14;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió esperar 2 semanas / quincena",
      etiquetaCorta: "+2 sem (14 días)",
    };
  }

  // 3 semanas / 20 días
  if (/(3|tres)\s*semanas|20\s*dias|veinte\s*dias/.test(norm)) {
    const dias = 21;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió esperar 3 semanas",
      etiquetaCorta: "+3 sem (21 días)",
    };
  }

  // 1 mes / el próximo mes
  if (/(1|un)\s*mes|proximo\s*mes|siguiente\s*mes|el\s*mes\s*que\s*entra|en\s*30\s*dias/.test(norm)) {
    const dias = 30;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió retomar el próximo mes",
      etiquetaCorta: "+1 mes (30 días)",
    };
  }

  // 2 meses
  if (/(2|dos)\s*meses|en\s*60\s*dias/.test(norm)) {
    const dias = 60;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió esperar 2 meses",
      etiquetaCorta: "+2 meses (60 días)",
    };
  }

  // 3 meses
  if (/(3|tres)\s*meses|en\s*90\s*dias/.test(norm)) {
    const dias = 90;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió esperar 3 meses",
      etiquetaCorta: "+3 meses (90 días)",
    };
  }

  // Días cortos
  if (/unos\s*dias|par\s*de\s*dias|pocos\s*dias|3\s*dias|tres\s*dias/.test(norm)) {
    const dias = 3;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió unos días",
      etiquetaCorta: "+3 días",
    };
  }

  if (/pasado\s*manana/.test(norm)) {
    const dias = 2;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió retomar pasado mañana",
      etiquetaCorta: "+2 días",
    };
  }

  if (/\bmanana\b/.test(norm)) {
    const dias = 1;
    return {
      detectado: true,
      dias,
      fecha: sumarDias(base, dias),
      motivo: "Cliente pidió retomar mañana",
      etiquetaCorta: "+1 día (mañana)",
    };
  }

  // Días de la semana específicos (ej. el próximo lunes)
  const diasSemana = [
    { regex: /\blunes\b/, dia: 1, nombre: "lunes" },
    { regex: /\bmartes\b/, dia: 2, nombre: "martes" },
    { regex: /\bmiercoles\b/, dia: 3, nombre: "miércoles" },
    { regex: /\bjueves\b/, dia: 4, nombre: "jueves" },
    { regex: /\bviernes\b/, dia: 5, nombre: "viernes" },
    { regex: /\bsabado\b/, dia: 6, nombre: "sábado" },
    { regex: /\bdomingo\b/, dia: 0, nombre: "domingo" },
  ];
  for (const ds of diasSemana) {
    if (ds.regex.test(norm) && /(el|proximo|siguiente|este)\s+/.test(norm)) {
      const dObj = new Date(`${base}T12:00:00Z`);
      const currentDay = dObj.getUTCDay();
      let diff = (ds.dia - currentDay + 7) % 7;
      if (diff === 0) diff = 7;
      return {
        detectado: true,
        dias: diff,
        fecha: sumarDias(base, diff),
        motivo: `Cliente pidió retomar el ${ds.nombre}`,
        etiquetaCorta: `Próx. ${ds.nombre} (${diff}d)`,
      };
    }
  }

  // Meses calendario (ej. "hasta diciembre", "en enero")
  const meses = [
    { nombre: "enero", idx: 0 },
    { nombre: "febrero", idx: 1 },
    { nombre: "marzo", idx: 2 },
    { nombre: "abril", idx: 3 },
    { nombre: "mayo", idx: 4 },
    { nombre: "junio", idx: 5 },
    { nombre: "julio", idx: 6 },
    { nombre: "agosto", idx: 7 },
    { nombre: "septiembre", idx: 8 },
    { nombre: "octubre", idx: 9 },
    { nombre: "noviembre", idx: 10 },
    { nombre: "diciembre", idx: 11 },
  ];
  for (const m of meses) {
    if (new RegExp(`\\b${m.nombre}\\b`).test(norm)) {
      const dObj = new Date(`${base}T12:00:00Z`);
      const currentYear = dObj.getUTCFullYear();
      const currentMonth = dObj.getUTCMonth();
      const targetYear = m.idx < currentMonth ? currentYear + 1 : currentYear;
      const targetMonthStr = String(m.idx + 1).padStart(2, "0");
      const targetFecha = `${targetYear}-${targetMonthStr}-01`;
      const diffMs = new Date(`${targetFecha}T12:00:00Z`).getTime() - dObj.getTime();
      const diffDias = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      return {
        detectado: true,
        dias: diffDias,
        fecha: targetFecha,
        motivo: `Cliente pidió retomar en ${m.nombre}`,
        etiquetaCorta: `${m.nombre.slice(0, 3)} ${targetYear}`,
      };
    }
  }

  // Fallback sin detección específica: +7 días como valor comercial predeterminado
  return {
    detectado: false,
    dias: 7,
    fecha: sumarDias(base, 7),
    motivo: "",
    etiquetaCorta: "+1 sem (7 días)",
  };
}

/**
 * Calcula la fecha para retomar a partir de lo que dijo el cliente:
 *  - Lenguaje natural ("una semana más", "en 15 días", "el próximo mes", etc.): infiere los días exactos.
 *  - "YYYY-MM" (mes): se retoma `diasAnticipacion` días antes.
 *  - "YYYY-MM-DD" (día): si es de corto plazo (<= 35 días), se respeta la fecha exacta; si es lejana, con anticipación.
 *  - Sin fecha clara: dentro de 7 días (evitando aplazar un mes completo a ciegas).
 * Nunca regresa una fecha anterior a mañana.
 */
export function calcularFechaRetomar(fechaCliente: string | null | undefined, diasAnticipacion = DIAS_ANTICIPACION_DEFAULT): string {
  const hoy = hoyMexico();
  const manana = sumarDias(hoy, 1);
  const f = (fechaCliente || "").trim();
  if (!f) return sumarDias(hoy, 7);

  // 1. Si es formato mes YYYY-MM
  if (/^\d{4}-\d{2}$/.test(f)) {
    const objetivo = `${f}-01`;
    const anticipado = sumarDias(objetivo, -Math.max(0, diasAnticipacion));
    return anticipado < manana ? manana : anticipado;
  }

  // 2. Si es formato fecha exacta YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    const diffDias = Math.round((new Date(`${f}T12:00:00Z`).getTime() - new Date(`${hoy}T12:00:00Z`).getTime()) / 86400000);
    if (diffDias <= 35) {
      return f < manana ? manana : f;
    }
    const anticipado = sumarDias(f, -Math.max(0, diasAnticipacion));
    return anticipado < manana ? manana : anticipado;
  }

  // 3. Lenguaje natural
  const inf = inferirPausaDesdeTexto(f, hoy);
  return inf.fecha < manana ? manana : inf.fecha;
}

async function leerConfig(sb: SupabaseClient): Promise<{ plantilla: string; diasAnticipacion: number }> {
  const { data } = await sb
    .from("configuracion_agente")
    .select("clave, valor")
    .in("clave", ["plantilla_retomar_pausa", "dias_anticipacion_retomar"]);
  const mapa = new Map((data || []).map((c: any) => [c.clave, String(c.valor ?? "")]));
  const dias = Number(mapa.get("dias_anticipacion_retomar"));
  return {
    plantilla: mapa.has("plantilla_retomar_pausa") ? (mapa.get("plantilla_retomar_pausa") || "").trim() : PLANTILLA_DEFAULT,
    diasAnticipacion: Number.isFinite(dias) && dias >= 0 ? dias : DIAS_ANTICIPACION_DEFAULT,
  };
}

function fechaLegible(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

async function sincronizarMautic(prospectoId: string | null | undefined, etapa: string): Promise<void> {
  if (!prospectoId) return;
  try {
    const { sincronizarConectorMautic } = await import("@/lib/conector-rudder-mautic");
    await sincronizarConectorMautic({ userId: prospectoId, etapa });
  } catch (err) {
    console.error("[Pausa] Error sincronizando con Mautic:", err);
  }
}

/**
 * Pone un negocio en pausa hasta `retomar_en`. Si ya estaba en pausa, solo actualiza fecha y motivo.
 * Devuelve la fecha de reactivación (YYYY-MM-DD).
 */
export async function pausarExpediente(
  sb: SupabaseClient,
  params: {
    expedienteId: string;
    /** Lo que dijo el cliente: "YYYY-MM" o "YYYY-MM-DD". Se aplica la anticipación configurada. */
    fechaCliente?: string | null;
    /** Fecha exacta elegida por un usuario (YYYY-MM-DD). Tiene prioridad y no aplica anticipación. */
    retomarEn?: string | null;
    motivo?: string | null;
    origen: string;
  }
): Promise<{ ok: boolean; retomarEn?: string; error?: string }> {
  const { data: exp, error } = await sb
    .from("expedientes")
    .select("id, etapa, etapa_previa, prospecto_id")
    .eq("id", params.expedienteId)
    .maybeSingle();
  if (error || !exp) return { ok: false, error: error?.message || "Expediente no encontrado." };
  if (["perdido", "cerrado", "venta"].includes(exp.etapa)) {
    return { ok: false, error: `El negocio está en etapa terminal (${exp.etapa}); no se puede pausar.` };
  }

  const { diasAnticipacion } = await leerConfig(sb);
  const manana = sumarDias(hoyMexico(), 1);
  const retomarEn = params.retomarEn && /^\d{4}-\d{2}-\d{2}$/.test(params.retomarEn)
    ? (params.retomarEn < manana ? manana : params.retomarEn)
    : calcularFechaRetomar(params.fechaCliente, diasAnticipacion);
  const yaPausado = exp.etapa === ETAPA_PAUSA;
  const motivo = (params.motivo || "").trim().slice(0, 300) || null;

  const { error: errUpd } = await sb
    .from("expedientes")
    .update({
      etapa: ETAPA_PAUSA,
      etapa_previa: yaPausado ? exp.etapa_previa : exp.etapa,
      retomar_en: retomarEn,
      motivo_pausa: motivo,
      pausado_en: new Date().toISOString(),
      ultimo_movimiento: hoyMexico(),
    })
    .eq("id", exp.id);
  if (errUpd) return { ok: false, error: errUpd.message };

  if (!yaPausado) {
    // Cotizaciones activas → pausada (se recuerda su estatus para restaurarlo)
    const { data: cots } = await sb
      .from("cotizaciones")
      .select("id, estatus")
      .eq("expediente_id", exp.id)
      .in("estatus", ESTATUS_COTIZACION_PAUSABLES);
    for (const c of cots || []) {
      await sb.from("cotizaciones").update({ estatus: "pausada", estatus_previo: c.estatus }).eq("id", c.id);
    }

    // Sacarlo de cualquier secuencia automática activa
    await sb
      .from("sequence_enrollments")
      .update({ status: "salido", razon_salida: "en_pausa", ultimo_contacto_at: new Date().toISOString() })
      .eq("expediente_id", exp.id)
      .eq("status", "activo");
  }

  const { registrarActividad } = await import("./actividades.ts");
  await registrarActividad(sb, {
    expedienteId: exp.id,
    tipo: "etapa",
    titulo: yaPausado ? `Pausa actualizada: retomar el ${fechaLegible(retomarEn)}` : `En pausa hasta el ${fechaLegible(retomarEn)}`,
    detalle: `${params.origen}${motivo ? ` · Motivo: ${motivo}` : ""}. Sin campañas ni seguimientos automáticos hasta esa fecha.`,
  });

  if (!yaPausado && exp.prospecto_id) {
    const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
    await sincronizarEstatusProspecto(sb, exp.prospecto_id);
  }
  await sincronizarMautic(exp.prospecto_id, ETAPA_PAUSA);
  return { ok: true, retomarEn };
}

/**
 * Saca un negocio de la pausa: regresa a su etapa previa y restaura sus cotizaciones.
 * No envía mensajes ni crea tareas (eso lo hace `despertarLeadsEnPausa`).
 */
export async function reactivarExpediente(
  sb: SupabaseClient,
  expedienteId: string,
  origen: string
): Promise<{ ok: boolean; etapa?: string; error?: string }> {
  const { data: exp } = await sb
    .from("expedientes")
    .select("id, etapa, etapa_previa, prospecto_id, tipo_negocio")
    .eq("id", expedienteId)
    .maybeSingle();
  if (!exp || exp.etapa !== ETAPA_PAUSA) return { ok: false, error: "El negocio no está en pausa." };

  const { esTipoNegocioConstruccion } = await import("@/lib/etapas");
  const etapa = exp.etapa_previa && exp.etapa_previa !== ETAPA_PAUSA
    ? exp.etapa_previa
    : esTipoNegocioConstruccion(exp.tipo_negocio) ? "interes" : "contactado";

  const { error } = await sb
    .from("expedientes")
    .update({ etapa, etapa_previa: null, retomar_en: null, pausado_en: null, ultimo_movimiento: hoyMexico() })
    .eq("id", exp.id)
    .eq("etapa", ETAPA_PAUSA);
  if (error) return { ok: false, error: error.message };

  const { data: cots } = await sb
    .from("cotizaciones")
    .select("id, estatus_previo")
    .eq("expediente_id", exp.id)
    .eq("estatus", "pausada");
  for (const c of cots || []) {
    await sb.from("cotizaciones").update({ estatus: c.estatus_previo || "enviada", estatus_previo: null }).eq("id", c.id);
  }

  await registrarActividad(sb, {
    expedienteId: exp.id,
    tipo: "etapa",
    titulo: "Sale de pausa",
    detalle: `${origen}. Regresa a la etapa "${etapa}".`,
  });
  if (exp.prospecto_id) {
    const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
    await sincronizarEstatusProspecto(sb, exp.prospecto_id);
  }
  await sincronizarMautic(exp.prospecto_id, etapa);
  return { ok: true, etapa };
}

/** Horario permitido para enviar la plantilla (L-S 9:00-19:00 hora de México; domingo no). */
function enHorarioComercial(): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const dia = partes.find((p) => p.type === "weekday")?.value;
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  if (dia === "Sun") return false;
  if (dia === "Sat") return hora >= 9 && hora < 14;
  return hora >= 9 && hora < 19;
}

/**
 * Despierta los negocios cuya fecha de retomar ya llegó. Solo corre en horario comercial para
 * que la plantilla y las tareas lleguen cuando el equipo puede atenderlas.
 */
export async function despertarLeadsEnPausa(
  sb: SupabaseClient
): Promise<{ procesados: number; despertados: number; plantillas: number; errores: string[] }> {
  const res = { procesados: 0, despertados: 0, plantillas: 0, errores: [] as string[] };
  if (!enHorarioComercial()) return res;

  const { data: pendientes, error } = await sb
    .from("expedientes")
    .select("id, cliente, telefono, tipo_negocio, prospecto_id, asesor_id, operador_id, motivo_pausa, pausado_en, retomar_en")
    .eq("etapa", ETAPA_PAUSA)
    .lte("retomar_en", hoyMexico())
    .limit(50);
  if (error) {
    res.errores.push(`Error leyendo negocios en pausa: ${error.message}`);
    return res;
  }
  if (!pendientes || pendientes.length === 0) return res;

  const { plantilla } = await leerConfig(sb);
  const { data: admins } = await sb.from("perfiles").select("id, nombre, telegram_chat_id").eq("rol", "admin").eq("activo", true);
  const { obtenerConfiguracionTelegram, enviarMensajeTelegram } = await import("./telegram.ts");
  const { botToken } = await obtenerConfiguracionTelegram(sb);

  for (const exp of pendientes) {
    res.procesados++;
    try {
      const r = await reactivarExpediente(sb, exp.id, "Llegó la fecha para retomar");
      if (!r.ok) continue;
      res.despertados++;

      const nombre = (exp.cliente || "Cliente").trim();
      const primerNombre = nombre.split(/\s+/)[0] || "Cliente";
      const servicio = SERVICIO_POR_NEGOCIO[exp.tipo_negocio || ""] || "tu proyecto";
      const pausadoEl = exp.pausado_en ? fechaLegible(String(exp.pausado_en).slice(0, 10)) : "antes";
      const motivo = exp.motivo_pausa ? ` Motivo: ${exp.motivo_pausa}.` : "";

      // 1. Plantilla de WhatsApp al cliente
      let estadoPlantilla = "sin plantilla configurada";
      if (plantilla && exp.telefono) {
        const params = [primerNombre, servicio];
        const { enviarWhatsAppPlantilla, renderizarPlantilla } = await import("./whatsapp.ts");
        const wa = await enviarWhatsAppPlantilla(exp.telefono, plantilla, "es_MX", params);
        if (wa.ok) {
          res.plantillas++;
          estadoPlantilla = `plantilla "${plantilla}" enviada`;
          const texto = (await renderizarPlantilla(plantilla, "es_MX", params)) || `[Plantilla: ${plantilla}] ${params.join(" | ")}`;
          await sb.from("mensajes_whatsapp").insert({
            telefono: exp.telefono,
            texto,
            direccion: "out",
            expediente_id: exp.id,
            prospecto_id: exp.prospecto_id ?? null,
            estado: "enviado",
            wa_message_id: wa.messageId ?? null,
            agente: "Sistema (Retomar pausa)",
          });
        } else {
          estadoPlantilla = `la plantilla "${plantilla}" NO se pudo enviar (${wa.errorDetail || wa.error || "error"}); escríbele manualmente`;
          res.errores.push(`[${exp.id}] Plantilla: ${wa.error}`);
        }
      }

      // 2. Tareas para el asesor y los administradores
      const asesorId = exp.asesor_id || exp.operador_id || null;
      const avisar = [...new Set([asesorId, ...(admins || []).map((a: any) => a.id as string)].filter((x): x is string => Boolean(x)))];
      const titulo = `Retomar a ${nombre} (${servicio})`;
      const descripcion = `Pospuso el ${pausadoEl} y pidió retomarlo ahora.${motivo} Estado del mensaje automático: ${estadoPlantilla}.`;
      const responsables: (string | null)[] = avisar.length > 0 ? avisar : [null];
      await sb.from("bpm_expediente_tareas").insert(
        responsables.map((responsable_id) => ({
          expediente_id: exp.id,
          titulo,
          descripcion,
          estado: "pendiente",
          responsable_id,
          dias_vencimiento: 2,
          agendada_para: new Date().toISOString(),
        }))
      );

      // 3. Notificación en la app
      if (avisar.length > 0) {
        await sb.from("notificaciones").insert(
          avisar.map((perfil_id) => ({
            perfil_id,
            titulo: `⏰ Hoy toca retomar a ${nombre}`,
            cuerpo: descripcion,
            enlace: `/expediente/${exp.id}`,
            leido: false,
          }))
        );
      }

      // 4. Telegram (asesor + administradores con chat configurado)
      if (botToken && avisar.length > 0) {
        const { data: perfilesTg } = await sb.from("perfiles").select("id, telegram_chat_id").in("id", avisar);
        const textoTg = `⏰ *Hoy toca retomar a ${nombre}*\nServicio: ${servicio}\n${descripcion}\nExpediente: ${exp.id}`;
        for (const p of perfilesTg || []) {
          if (p.telegram_chat_id) await enviarMensajeTelegram({ botToken, chatId: p.telegram_chat_id, texto: textoTg });
        }
      }

      await registrarActividad(sb, {
        expedienteId: exp.id,
        tipo: "sistema",
        titulo: "Recordatorio para retomar",
        detalle: `Tareas creadas para el asesor y administradores. Mensaje al cliente: ${estadoPlantilla}.`,
      });
    } catch (err: any) {
      res.errores.push(`[${exp.id}] ${err?.message || err}`);
    }
  }
  return res;
}
