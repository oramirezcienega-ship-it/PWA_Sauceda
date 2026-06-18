"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { obtenerTodosLosAnalisis } from "./analisis-ia";

// Definición de Interfaces Estándar (Schema A)
export interface CRMLead {
  id: string;
  name: string;
  phone: string;
  source: string;
  created_at: string;
}

export interface CRMConversation {
  id: string;
  lead_id: string;
  qualified: "verde" | "amarillo" | "rojo";
  status: "sin contactar" | "en proceso" | "calificado" | "perdido";
  created_at: string;
}

export interface CRMMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
}

// Datos consolidados retornados por el Server Action
export interface CRMData {
  timestamp: string;
  schemaUsado: "estandar" | "fallback";
  leads: Array<{
    id: string;
    name: string;
    phone: string;
    source: string;
    created_at: string;
    status: "sin contactar" | "en proceso" | "calificado" | "perdido";
    qualified: "verde" | "amarillo" | "rojo";
    tiempoUltimoMensaje: string; // Ej: "Hace 2 horas" o "Sin mensajes"
    sinRespuestaSofia: boolean; // Si lleva >24h sin respuesta de Sofía
    ultimoTexto: string;
    conversacionCompleta: CRMMessage[];
    analisisIA?: {
      telefono: string;
      resumen: string;
      punto_de_quiebre: string;
      razon_perdida: string;
      calidad_lead: "alta" | "media" | "baja";
      recomendacion: string;
      recuperable: boolean;
      created_at: string;
    };
  }>;
  resumenEmbudo: {
    totalLeads: number;
    contactados: number;
    respondieron: number;
    calificadosVerde: number;
    calificadosAmarillo: number;
    calificadosRojo: number;
    perdidos: number;
    tasaLeadAContactado: number;
    tasaContactadoARespondio: number;
    tasaRespondioACalificado: number;
  };
  tiempoRespuesta: {
    promedioMinutos: number;
    distribucion: {
      menos5min: number;
      entre5y30min: number;
      entre30miny2hr: number;
      mas2hr: number;
    };
    alerta: boolean;
  };
  analisisConversaciones: {
    mensajesAperturaComunes: Array<{ texto: string; cantidad: number }>;
    puntosDeCortePerdidos: Array<{ texto: string; remitente: "user" | "assistant"; cantidad: number }>;
    heatmapRespuestaHora: Array<{ hora: number; leads: number; respuestas: number; tasa: number }>;
    palabrasClaveCalificaron: Array<{ palabra: string; cantidad: number }>;
    palabrasClaveNoCalificaron: Array<{ palabra: string; cantidad: number }>;
  };
  evolucionSemanal: {
    semanas: Array<{
      semana: string; // Ej: "Semana 24" o "Lun 15/06"
      leadsRecibidos: number;
      tasaRespuesta: number;
    }>;
    wowLeadsVariacionPct: number;
    wowTasaRespuestaVariacionPct: number;
  };
}

/** Stopwords en español para limpiar en el conteo de palabras clave */
const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "y", "o", "u", "e",
  "que", "en", "para", "por", "con", "sin", "sobre", "tras", "entre", "hasta", "desde", "es", "son",
  "fue", "era", "ser", "se", "lo", "le", "les", "me", "te", "nos", "mi", "tu", "su", "sus", "como",
  "mas", "mas", "pero", "si", "no", "no", "este", "esta", "estos", "estas", "ese", "esa", "esos",
  "esas", "aquel", "aquella", "todos", "todo", "bien", "ya", "muy", "tambien", "hola", "buenos",
  "dias", "tardes", "noches", "gracias", "por", "favor", "casa", "credito", "traspaso", "tengo",
  "quiero", "hola,", "como", "esta", "esta", "estoy", "hola", "en", "un", "una", "del", "al", "mi",
  "tu", "su", "lo", "le", "se", "me", "te", "nos", "les"
]);

/** Limpia y separa un texto en palabras significativas */
function extraerPalabrasClave(texto: string): string[] {
  if (!texto) return [];
  return texto
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'¿]/g, "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/** Helper para formatear diferencia de tiempo */
function calcularTiempoTranscurrido(fechaStr: string): { label: string; horas: number } {
  if (!fechaStr) return { label: "Sin mensajes", horas: 0 };
  const diffMs = Date.now() - new Date(fechaStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  const horas = Math.floor(mins / 60);
  const dias = Math.floor(horas / 24);

  if (mins < 1) return { label: "Ahora mismo", horas: 0 };
  if (mins < 60) return { label: `Hace ${mins} min`, horas: mins / 60 };
  if (horas < 24) return { label: `Hace ${horas} hr${horas === 1 ? "" : "s"}`, horas };
  return { label: `Hace ${dias} día${dias === 1 ? "" : "s"}`, horas };
}

/** Obtiene el número de semana ISO a partir de una fecha */
function obtenerNumeroSemana(d: Date): string {
  const copia = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaNum = copia.getUTCDay() || 7;
  copia.setUTCDate(copia.getUTCDate() + 4 - diaNum);
  const anioInicio = new Date(Date.UTC(copia.getUTCFullYear(), 0, 1));
  const numSemana = Math.ceil((((copia.getTime() - anioInicio.getTime()) / 86400000) + 1) / 7);
  return `Sem ${numSemana} (${copia.getUTCFullYear()})`;
}

/** Devuelve los datos para el CRM Dashboard con fallback de base de datos */
export async function obtenerDatosCRM(): Promise<CRMData> {
  // Asegura sesión de administrador antes de hacer nada
  await requireAdmin();
  const sb = supabaseServidor();

  let schemaUsado: "estandar" | "fallback" = "estandar";
  let leadsRaw: CRMLead[] = [];
  let conversationsRaw: CRMConversation[] = [];
  let messagesRaw: CRMMessage[] = [];

  try {
    // 1. Intentar esquema estándar (leads, conversations, messages)
    const [lRes, cRes, mRes] = await Promise.all([
      sb.from("leads").select("*"),
      sb.from("conversations").select("*"),
      sb.from("messages").select("*").order("created_at", { ascending: true })
    ]);

    if (lRes.error || cRes.error || mRes.error) {
      // Si hay error en alguna tabla, forzar fallback
      throw new Error("Error en esquema estándar, recurriendo a fallback.");
    }

    leadsRaw = lRes.data ?? [];
    conversationsRaw = cRes.data ?? [];
    messagesRaw = mRes.data ?? [];
  } catch (err) {
    // 2. Esquema Fallback (prospectos, expedientes, mensajes_whatsapp)
    schemaUsado = "fallback";
    
    const [pRes, eRes, mwRes] = await Promise.all([
      sb.from("prospectos").select("*"),
      sb.from("expedientes").select("id, prospecto_id, etapa, created_at"),
      sb.from("mensajes_whatsapp").select("*").order("created_at", { ascending: true })
    ]);

    if (pRes.error) {
      throw new Error(`Error al leer prospectos: ${pRes.error.message}`);
    }

    const prospectos = pRes.data ?? [];
    const expedientes = eRes.data ?? [];
    const mensajes = mwRes.data ?? [];

    // Mapear prospectos a CRMLead
    leadsRaw = prospectos.map((p) => ({
      id: p.id,
      name: [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" ") || p.telefono || "Sin nombre",
      phone: p.telefono,
      source: p.origen || "otro",
      created_at: p.created_at
    }));

    // Mapear expedientes a CRMConversation
    conversationsRaw = expedientes.map((e) => {
      let status: CRMConversation["status"] = "en proceso";
      let qualified: CRMConversation["qualified"] = "amarillo";

      if (e.etapa === "nuevo-lead") status = "sin contactar";
      else if (e.etapa === "cerrado") {
        status = "calificado";
        qualified = "verde";
      } else if (e.etapa === "perdido") {
        status = "perdido";
        qualified = "rojo";
      }

      return {
        id: e.id,
        lead_id: e.prospecto_id || "",
        qualified,
        status,
        created_at: e.created_at
      };
    });

    // Mapear mensajes_whatsapp a CRMMessage
    messagesRaw = mensajes.map((m) => {
      // Enlazar la conversación por el id de expediente o prospecto o por el teléfono
      let conversation_id = m.expediente_id || m.prospecto_id || m.telefono;
      
      return {
        id: m.id,
        conversation_id,
        role: m.direccion === "in" ? "user" : "assistant",
        text: m.texto || "",
        created_at: m.created_at
      };
    });
  }

  // Si no hay leads, devolvemos estructura vacía limpia
  if (leadsRaw.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      schemaUsado,
      leads: [],
      resumenEmbudo: {
        totalLeads: 0,
        contactados: 0,
        respondieron: 0,
        calificadosVerde: 0,
        calificadosAmarillo: 0,
        calificadosRojo: 0,
        perdidos: 0,
        tasaLeadAContactado: 0,
        tasaContactadoARespondio: 0,
        tasaRespondioACalificado: 0
      },
      tiempoRespuesta: {
        promedioMinutos: 0,
        distribucion: { menos5min: 0, entre5y30min: 0, entre30miny2hr: 0, mas2hr: 0 },
        alerta: false
      },
      analisisConversaciones: {
        mensajesAperturaComunes: [],
        puntosDeCortePerdidos: [],
        heatmapRespuestaHora: [],
        palabrasClaveCalificaron: [],
        palabrasClaveNoCalificaron: []
      },
      evolucionSemanal: {
        semanas: [],
        wowLeadsVariacionPct: 0,
        wowTasaRespuestaVariacionPct: 0
      }
    };
  }

  // Mapear mensajes por id de conversación/teléfono
  const mensajesPorConversacion = new Map<string, CRMMessage[]>();
  messagesRaw.forEach((m) => {
    const list = mensajesPorConversacion.get(m.conversation_id) ?? [];
    list.push(m);
    mensajesPorConversacion.set(m.conversation_id, list);
  });

  // Mapear conversaciones por lead_id
  const conversacionesPorLead = new Map<string, CRMConversation>();
  conversationsRaw.forEach((c) => {
    if (c.lead_id) {
      conversacionesPorLead.set(c.lead_id, c);
    }
  });

  // Cargar análisis de IA cacheados
  const listAnalisis = await obtenerTodosLosAnalisis();
  const analisisMap = new Map<string, any>();
  listAnalisis.forEach((a) => {
    analisisMap.set(a.telefono, a);
  });

  // Procesamos cada lead individualmente
  const leadsProcesados = leadsRaw.map((l) => {
    let conv = conversacionesPorLead.get(l.id);
    let convId = conv ? conv.id : l.id;

    // Buscar mensajes por id de conversación o por teléfono
    let msgs = mensajesPorConversacion.get(convId) || mensajesPorConversacion.get(l.phone) || [];

    // Sintetizar conversación si no existe pero hay mensajes
    if (!conv && msgs.length > 0) {
      conv = {
        id: convId,
        lead_id: l.id,
        qualified: "amarillo",
        status: "en proceso",
        created_at: l.created_at
      };
    }

    const status = conv?.status ?? "sin contactar";
    const qualified = conv?.qualified ?? "amarillo";

    let ultimoTexto = "";
    let tiempoUltimoMensaje = "Sin mensajes";
    let sinRespuestaSofia = false;

    if (msgs.length > 0) {
      const ultimoMsg = msgs[msgs.length - 1];
      ultimoTexto = ultimoMsg.text;
      const { label, horas } = calcularTiempoTranscurrido(ultimoMsg.created_at);
      tiempoUltimoMensaje = label;

      // Si el último mensaje es del cliente ('user') y lleva más de 24 horas sin respuesta
      if (ultimoMsg.role === "user" && horas > 24) {
        sinRespuestaSofia = true;
      }
    }

    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source,
      created_at: l.created_at,
      status,
      qualified,
      tiempoUltimoMensaje,
      sinRespuestaSofia,
      ultimoTexto,
      conversacionCompleta: msgs,
      analisisIA: analisisMap.get(l.phone)
    };
  });

  // --- MÉTRICAS DE EMBUDO ---
  let contactados = 0;
  let respondieron = 0;
  let calificadosVerde = 0;
  let calificadosAmarillo = 0;
  let calificadosRojo = 0;
  let perdidos = 0;

  const respuestaTiempos: number[] = [];

  leadsProcesados.forEach((lp) => {
    const lCreated = new Date(lp.created_at).getTime();
    const msgs = lp.conversacionCompleta;

    // Contactado = al menos 1 mensaje de salida ('assistant') posterior a la creación del lead
    const primerMsgSofia = msgs.find((m) => m.role === "assistant" && new Date(m.created_at).getTime() >= lCreated);
    const esContactado = !!primerMsgSofia;
    if (esContactado) contactados++;

    // Respondió = al menos 1 mensaje de entrada ('user') posterior al primer mensaje de Sofia
    let esRespondio = false;
    if (primerMsgSofia) {
      const sofiaTime = new Date(primerMsgSofia.created_at).getTime();
      const primerUserMsg = msgs.find((m) => m.role === "user" && new Date(m.created_at).getTime() > sofiaTime);
      esRespondio = !!primerUserMsg;
      if (esRespondio) respondieron++;

      // Calcular tiempo de respuesta
      const diffMs = sofiaTime - lCreated;
      if (diffMs >= 0) {
        respuestaTiempos.push(diffMs / 60000); // en minutos
      }
    }

    if (lp.qualified === "verde") calificadosVerde++;
    else if (lp.qualified === "amarillo") calificadosAmarillo++;
    else if (lp.qualified === "rojo") calificadosRojo++;

    if (lp.status === "perdido" || lp.qualified === "rojo") {
      perdidos++;
    }
  });

  const totalLeads = leadsProcesados.length;
  const tasaLeadAContactado = totalLeads ? Math.round((contactados / totalLeads) * 100) : 0;
  const tasaContactadoARespondio = contactados ? Math.round((respondieron / contactados) * 100) : 0;
  const totalCalificados = calificadosVerde + calificadosAmarillo;
  const tasaRespondioACalificado = respondieron ? Math.round((totalCalificados / respondieron) * 100) : 0;

  // --- TIEMPO DE RESPUESTA ---
  let promedioMinutos = 0;
  let menos5min = 0;
  let entre5y30min = 0;
  let entre30miny2hr = 0;
  let mas2hr = 0;

  if (respuestaTiempos.length > 0) {
    const sum = respuestaTiempos.reduce((a, b) => a + b, 0);
    promedioMinutos = Math.round(sum / respuestaTiempos.length);

    respuestaTiempos.forEach((t) => {
      if (t < 5) menos5min++;
      else if (t < 30) entre5y30min++;
      else if (t < 120) entre30miny2hr++;
      else mas2hr++;
    });
  }

  const alerta = promedioMinutos > 5;

  // --- ANÁLISIS DE CONVERSACIONES ---
  const aperturasCount = new Map<string, number>();
  const cortesCount = new Map<string, { texto: string; remitente: "user" | "assistant"; cantidad: number }>();
  const horasLeads = Array.from({ length: 24 }, (_, i) => ({ hora: i, leads: 0, respuestas: 0 }));
  const palabrasCalificados = new Map<string, number>();
  const palabrasNoCalificados = new Map<string, number>();

  leadsProcesados.forEach((lp) => {
    const msgs = lp.conversacionCompleta;
    const lCreated = new Date(lp.created_at);
    const horaEntrada = lCreated.getHours();

    horasLeads[horaEntrada].leads++;
    
    const lCreatedMs = lCreated.getTime();
    const primerMsgSofia = msgs.find((m) => m.role === "assistant" && new Date(m.created_at).getTime() >= lCreatedMs);
    const esRespondio = primerMsgSofia && msgs.some((m) => m.role === "user" && new Date(m.created_at).getTime() > new Date(primerMsgSofia.created_at).getTime());
    if (esRespondio) {
      horasLeads[horaEntrada].respuestas++;
    }

    if (msgs.length > 0) {
      const msgAp = msgs.find((m) => m.role === "assistant");
      if (msgAp && msgAp.text) {
        const txtLimpio = msgAp.text.trim();
        aperturasCount.set(txtLimpio, (aperturasCount.get(txtLimpio) ?? 0) + 1);
      }

      if (lp.status === "perdido" || lp.qualified === "rojo") {
        const ultimoMsg = msgs[msgs.length - 1];
        if (ultimoMsg && ultimoMsg.text) {
          const txtCorte = ultimoMsg.text.trim().slice(0, 100) + (ultimoMsg.text.length > 100 ? "..." : "");
          const val = cortesCount.get(txtCorte) ?? { texto: txtCorte, remitente: ultimoMsg.role, cantidad: 0 };
          val.cantidad++;
          cortesCount.set(txtCorte, val);
        }
      }
    }

    const esCalificado = lp.qualified === "verde" || lp.qualified === "amarillo";
    msgs.forEach((m) => {
      const palabras = extraerPalabrasClave(m.text);
      palabras.forEach((p) => {
        if (esCalificado) {
          palabrasCalificados.set(p, (palabrasCalificados.get(p) ?? 0) + 1);
        } else {
          palabrasNoCalificados.set(p, (palabrasNoCalificados.get(p) ?? 0) + 1);
        }
      });
    });
  });

  const mensajesAperturaComunes = Array.from(aperturasCount.entries())
    .map(([texto, cantidad]) => ({ texto, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  const puntosDeCortePerdidos = Array.from(cortesCount.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  const heatmapRespuestaHora = horasLeads.map((h) => ({
    hora: h.hora,
    leads: h.leads,
    respuestas: h.respuestas,
    tasa: h.leads ? Math.round((h.respuestas / h.leads) * 100) : 0
  }));

  const palabrasClaveCalificaron = Array.from(palabrasCalificados.entries())
    .map(([palabra, cantidad]) => ({ palabra, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 15);

  const palabrasClaveNoCalificaron = Array.from(palabrasNoCalificados.entries())
    .map(([palabra, cantidad]) => ({ palabra, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 15);

  // --- EVOLUCIÓN SEMANAL ---
  const leadsPorSemana = new Map<string, { leads: number; respuestas: number }>();
  leadsProcesados.forEach((lp) => {
    const date = new Date(lp.created_at);
    const semKey = obtenerNumeroSemana(date);

    const msgs = lp.conversacionCompleta;
    const lCreatedMs = date.getTime();
    const primerMsgSofia = msgs.find((m) => m.role === "assistant" && new Date(m.created_at).getTime() >= lCreatedMs);
    const esRespondio = primerMsgSofia && msgs.some((m) => m.role === "user" && new Date(m.created_at).getTime() > new Date(primerMsgSofia.created_at).getTime());

    const val = leadsPorSemana.get(semKey) ?? { leads: 0, respuestas: 0 };
    val.leads++;
    if (esRespondio) val.respuestas++;
    leadsPorSemana.set(semKey, val);
  });

  const semanasList = Array.from(leadsPorSemana.entries())
    .map(([semana, val]) => ({
      semana,
      leadsRecibidos: val.leads,
      tasaRespuesta: val.leads ? Math.round((val.respuestas / val.leads) * 100) : 0
    }))
    .sort((a, b) => {
      const matchA = a.semana.match(/Sem (\d+) \((\d+)\)/);
      const matchB = b.semana.match(/Sem (\d+) \((\d+)\)/);
      if (matchA && matchB) {
        const yA = parseInt(matchA[2], 10);
        const yB = parseInt(matchB[2], 10);
        if (yA !== yB) return yA - yB;
        const wA = parseInt(matchA[1], 10);
        const wB = parseInt(matchB[1], 10);
        return wA - wB;
      }
      return a.semana.localeCompare(b.semana);
    });

  let wowLeadsVariacionPct = 0;
  let wowTasaRespuestaVariacionPct = 0;

  if (semanasList.length >= 2) {
    const semActual = semanasList[semanasList.length - 1];
    const semAnterior = semanasList[semanasList.length - 2];

    const diffLeads = semActual.leadsRecibidos - semAnterior.leadsRecibidos;
    wowLeadsVariacionPct = semAnterior.leadsRecibidos ? Math.round((diffLeads / semAnterior.leadsRecibidos) * 100) : 0;

    const diffTasa = semActual.tasaRespuesta - semAnterior.tasaRespuesta;
    wowTasaRespuestaVariacionPct = diffTasa; // en puntos porcentuales
  }

  return {
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " - " + new Date().toLocaleDateString(),
    schemaUsado,
    leads: leadsProcesados,
    resumenEmbudo: {
      totalLeads,
      contactados,
      respondieron,
      calificadosVerde,
      calificadosAmarillo,
      calificadosRojo,
      perdidos,
      tasaLeadAContactado,
      tasaContactadoARespondio,
      tasaRespondioACalificado
    },
    tiempoRespuesta: {
      promedioMinutos,
      distribucion: { menos5min, entre5y30min, entre30miny2hr, mas2hr },
      alerta
    },
    analisisConversaciones: {
      mensajesAperturaComunes,
      puntosDeCortePerdidos,
      heatmapRespuestaHora,
      palabrasClaveCalificaron,
      palabrasClaveNoCalificaron
    },
    evolucionSemanal: {
      semanas: semanasList,
      wowLeadsVariacionPct,
      wowTasaRespuestaVariacionPct
    }
  };
}
