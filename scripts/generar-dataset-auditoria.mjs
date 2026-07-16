import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { join } from "node:path";

function cargarEnv() {
  try {
    const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const linea of texto.split("\n")) {
      const l = linea.trim();
      if (!l || l.startsWith("#")) continue;
      const i = l.indexOf("=");
      if (i === -1) continue;
      const clave = l.slice(0, i).trim();
      let valor = l.slice(i + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      process.env[clave] = valor;
    }
  } catch (e) {
    console.error("No se pudo cargar .env:", e.message);
  }
}

// Helpers para normalizar números de teléfono (tomados del código de la app)
function normalizarTelefono(tel) {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("521") && d.length === 13) return "52" + d.slice(3);
  if (d.startsWith("52") && d.length >= 12) return d.slice(0, 12);
  if (d.length === 10) return "52" + d;
  return d;
}

function esCanalSocial(telefono) {
  return (telefono || "").startsWith("messenger:") || (telefono || "").startsWith("instagram:");
}

function normalizarIdConversacion(tel) {
  if (esCanalSocial(tel)) return tel;
  return normalizarTelefono(tel);
}

const AGENTES_AUTOMATICOS = new Set(["IA", "Sofía (IA)", "Sistema (Secuencia)", "Sistema", "IA (Retoque)", ""]);

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  const sb = createClient(url, key);
  console.log("Conectado a Supabase. Extrayendo datos...");

  // 1. Cargar todos los mensajes de WhatsApp
  const { data: todosMensajes, error: errMsgs } = await sb
    .from("mensajes_whatsapp")
    .select("*")
    .order("created_at", { ascending: true });

  if (errMsgs) {
    console.error("Error al cargar mensajes_whatsapp:", errMsgs.message);
    return;
  }

  // 2. Cargar prospectos
  const { data: todosProspectos, error: errPros } = await sb
    .from("prospectos")
    .select("*");

  if (errPros) {
    console.error("Error al cargar prospectos:", errPros.message);
    return;
  }

  // 3. Cargar analisis_ia
  const { data: todosAnalisis, error: errAnalisis } = await sb
    .from("analisis_ia")
    .select("*");

  if (errAnalisis) {
    console.error("Error al cargar analisis_ia:", errAnalisis.message);
    return;
  }

  console.log(`Datos cargados: ${todosMensajes.length} mensajes, ${todosProspectos.length} prospectos, ${todosAnalisis.length} análisis IA.`);

  // 4. Mapear prospectos y análisis
  const prospectosMap = {};
  todosProspectos.forEach(p => {
    if (p.telefono) {
      prospectosMap[normalizarIdConversacion(p.telefono)] = p;
    }
    // También guardar por id de prospecto
    prospectosMap[p.id] = p;
  });

  const analisisMap = {};
  todosAnalisis.forEach(a => {
    analisisMap[normalizarIdConversacion(a.telefono)] = a;
  });

  // 5. Agrupar mensajes por conversación (teléfono normalizado)
  const conversaciones = {};
  todosMensajes.forEach(m => {
    const idConv = normalizarIdConversacion(m.telefono);
    if (!conversaciones[idConv]) {
      conversaciones[idConv] = {
        telefono: m.telefono,
        mensajes: [],
        prospecto: prospectosMap[idConv] || (m.prospecto_id ? prospectosMap[m.prospecto_id] : null)
      };
    }
    conversaciones[idConv].mensajes.push(m);
  });

  // Asociar prospecto si no se asoció antes
  Object.keys(conversaciones).forEach(idConv => {
    const conv = conversaciones[idConv];
    if (!conv.prospecto) {
      // Buscar en los mensajes si alguno tiene prospecto_id
      const msgConProspecto = conv.mensajes.find(m => m.prospecto_id);
      if (msgConProspecto) {
        conv.prospecto = prospectosMap[msgConProspecto.prospecto_id];
      }
    }
    conv.analisis = analisisMap[idConv];
  });

  // 6. Filtrar conversaciones "abandonadas" o "sin_cierre"
  // Criterios:
  // - El prospecto tiene estatus = 'no_viable'
  // - O la conversación está en la tabla de 'analisis_ia' (leads perdidos)
  // - O tiene mensajes pero no tiene expediente abierto ni es cliente y alguno de sus mensajes tiene finalizado = true
  const conversacionesFiltradas = [];

  Object.keys(conversaciones).forEach(idConv => {
    const conv = conversaciones[idConv];
    const tieneAnalisis = !!conv.analisis;
    const estatusProspecto = conv.prospecto ? conv.prospecto.estatus : null;
    const esNoViable = estatusProspecto === 'no_viable';
    
    // Si la conversación tiene finalizado = true y no está en expediente_abierto o cliente
    const tieneMsgFinalizado = conv.mensajes.some(m => m.finalizado);
    const esAbandonadaOSinCierre = tieneAnalisis || esNoViable || (tieneMsgFinalizado && estatusProspecto !== 'expediente_abierto' && estatusProspecto !== 'cliente');

    if (esAbandonadaOSinCierre) {
      conversacionesFiltradas.push(conv);
    }
  });

  console.log(`Conversaciones identificadas como abandonadas o sin cierre: ${conversacionesFiltradas.length}`);

  // 7. Estructurar los datos y calcular los campos requeridos
  const dataset = conversacionesFiltradas.map(conv => {
    const { mensajes, prospecto, telefono } = conv;
    
    // ID_Prospecto: id de prospecto o teléfono
    const ID_Prospecto = prospecto ? prospecto.id : normalizarIdConversacion(telefono);
    const Nombre_Prospecto = prospecto ? prospecto.nombre : "Desconocido";
    const Estatus_Real = prospecto ? prospecto.estatus : "sin_prospecto";
    const Origen = prospecto ? prospecto.origen : "desconocido";

    // Fecha: timestamp de inicio (primer mensaje de la conversación)
    const Fecha = mensajes[0] ? mensajes[0].created_at : (prospecto ? prospecto.created_at : null);

    // Identificar el último mensaje de la IA
    // Buscamos el último mensaje de salida ('out') donde el agente sea IA (o esté en la lista automática)
    const mensajesIA = mensajes.filter(m => m.direccion === 'out' && AGENTES_AUTOMATICOS.has(m.agente));
    const ultimoMsgIAObj = mensajesIA[mensajesIA.length - 1];
    const Ultimo_Mensaje_IA = ultimoMsgIAObj ? ultimoMsgIAObj.texto : "N/A";

    // Extraer la respuesta del usuario que precedió al abandono (última respuesta del usuario)
    const mensajesUsuario = mensajes.filter(m => m.direccion === 'in');
    const ultimaRespuestaUsuarioObj = mensajesUsuario[mensajesUsuario.length - 1];
    const Ultima_Respuesta_Usuario = ultimaRespuestaUsuarioObj ? ultimaRespuestaUsuarioObj.texto : "N/A";

    // Calcular el tiempo de reacción del usuario:
    // Para la última respuesta del usuario, buscamos el mensaje de la IA que lo precedió inmediatamente.
    let Tiempo_Reaccion_Usuario = null;
    if (ultimaRespuestaUsuarioObj) {
      const timestampUsuario = new Date(ultimaRespuestaUsuarioObj.created_at).getTime();
      // Filtrar mensajes de la IA que fueron enviados antes de la última respuesta del usuario
      const mensajesIAPrevios = mensajesIA.filter(m => new Date(m.created_at).getTime() < timestampUsuario);
      const msgIAPrevio = mensajesIAPrevios[mensajesIAPrevios.length - 1];
      
      if (msgIAPrevio) {
        const timestampIA = new Date(msgIAPrevio.created_at).getTime();
        Tiempo_Reaccion_Usuario = Math.round((timestampUsuario - timestampIA) / 1000); // en segundos
      }
    }

    // Identificar si el último mensaje de la IA contiene una pregunta (CTA)
    // El usuario pide: si contiene '?' entonces 'Pregunta_Abierta', sino 'Sin_Pregunta'
    const Tipo_Cierre = Ultimo_Mensaje_IA.includes('?') ? 'Pregunta_Abierta' : 'Sin_Pregunta';

    // Campos del análisis de IA si están disponibles para dar más contexto
    const Razon_Perdida = conv.analisis ? conv.analisis.razon_perdida : "N/A";
    const Calidad_Lead = conv.analisis ? conv.analisis.calidad_lead : "N/A";

    // Fecha del último mensaje en la conversación (para ordenar)
    const ultimoMensajeFecha = mensajes[mensajes.length - 1] ? mensajes[mensajes.length - 1].created_at : Fecha;

    return {
      ID_Prospecto,
      Nombre_Prospecto,
      Fecha,
      Ultimo_Mensaje_IA,
      Ultima_Respuesta_Usuario,
      Tiempo_Reaccion_Usuario,
      Tipo_Cierre,
      Estatus_Real,
      Origen,
      Razon_Perdida,
      Calidad_Lead,
      ultimoMensajeFecha
    };
  });

  // 8. Ordenar por la fecha del último mensaje en orden descendente (últimas conversaciones)
  dataset.sort((a, b) => new Date(b.ultimoMensajeFecha) - new Date(a.ultimoMensajeFecha));

  // 9. Tomar las últimas 100 conversaciones
  const ultimas100 = dataset.slice(0, 100);
  console.log(`Dataset final generado con ${ultimas100.length} registros.`);

  // 10. Exportar a JSON
  // Limpiamos el campo auxiliar usado para ordenar
  const datasetExport = ultimas100.map(({ ultimoMensajeFecha, ...resto }) => resto);
  const jsonPath = join(process.cwd(), "dataset_auditoria_ventas.json");
  writeFileSync(jsonPath, JSON.stringify(datasetExport, null, 2), "utf8");
  console.log(`Archivo JSON guardado en: ${jsonPath}`);

  // 11. Exportar a CSV
  // Helper para escapar campos de texto en CSV (evitar problemas con comas, saltos de línea y comillas)
  function escaparCSV(valor) {
    if (valor === null || valor === undefined) return "";
    const texto = String(valor);
    if (texto.includes(",") || texto.includes('"') || texto.includes("\n") || texto.includes("\r")) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  }

  const cabeceras = [
    "ID_Prospecto",
    "Nombre_Prospecto",
    "Fecha",
    "Ultimo_Mensaje_IA",
    "Ultima_Respuesta_Usuario",
    "Tiempo_Reaccion_Usuario",
    "Tipo_Cierre",
    "Estatus_Real",
    "Origen",
    "Razon_Perdida",
    "Calidad_Lead"
  ];

  const filasCSV = [cabeceras.join(",")];
  datasetExport.forEach(item => {
    const fila = cabeceras.map(cab => escaparCSV(item[cab]));
    filasCSV.push(fila.join(","));
  });

  const csvPath = join(process.cwd(), "dataset_auditoria_ventas.csv");
  writeFileSync(csvPath, filasCSV.join("\n"), "utf8");
  console.log(`Archivo CSV guardado en: ${csvPath}`);
}

main().catch(console.error);
