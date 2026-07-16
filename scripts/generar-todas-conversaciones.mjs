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

function esCanalSocial(telefono) {
  return (telefono || "").startsWith("messenger:") || (telefono || "").startsWith("instagram:");
}

function normalizarTelefono(tel) {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("521") && d.length === 13) return "52" + d.slice(3);
  if (d.startsWith("52") && d.length >= 12) return d.slice(0, 12);
  if (d.length === 10) return "52" + d;
  return d;
}

function normalizarIdConversacion(tel) {
  if (esCanalSocial(tel)) return tel;
  return normalizarTelefono(tel);
}

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  const sb = createClient(url, key);
  console.log("Conectado a Supabase. Descargando todos los mensajes...");

  // Cargar TODOS los mensajes ordenados por teléfono y cronología
  const { data: mensajes, error } = await sb
    .from("mensajes_whatsapp")
    .select("*")
    .order("telefono", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al consultar la tabla mensajes_whatsapp:", error.message);
    return;
  }

  console.log(`Se descargaron ${mensajes.length} mensajes en total.`);

  // Mapeo estructurado de campos según la lógica solicitada
  const datasetCompleto = mensajes.map(m => {
    const convId = normalizarIdConversacion(m.telefono);
    
    // Sender: determinar quién envió el mensaje
    let sender = "";
    if (m.direccion === "in") {
      sender = "cliente";
    } else {
      sender = m.agente || "IA";
    }

    // Message Type: entrante o saliente
    const message_type = m.direccion === "in" ? "entrante" : "saliente";

    // Metadata complementaria
    const metadata = {
      id: m.id,
      expediente_id: m.expediente_id || null,
      prospecto_id: m.prospecto_id || null,
      estado_whatsapp: m.estado || null,
      finalizado: m.finalizado || false
    };

    return {
      conversation_id: convId,
      timestamp: m.created_at,
      sender: sender,
      message_text: m.texto || "",
      message_type: message_type,
      metadata: JSON.stringify(metadata)
    };
  });

  // Exportar a JSON
  const jsonPath = join(process.cwd(), "todas_conversaciones_completas.json");
  writeFileSync(jsonPath, JSON.stringify(datasetCompleto, null, 2), "utf8");
  console.log(`Archivo JSON guardado con éxito en: ${jsonPath}`);

  // Exportar a CSV
  function escaparCSV(valor) {
    if (valor === null || valor === undefined) return "";
    const texto = String(valor);
    if (texto.includes(",") || texto.includes('"') || texto.includes("\n") || texto.includes("\r")) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  }

  const cabeceras = [
    "conversation_id",
    "timestamp",
    "sender",
    "message_text",
    "message_type",
    "metadata"
  ];

  const filasCSV = [cabeceras.join(",")];
  datasetCompleto.forEach(item => {
    const fila = cabeceras.map(cab => escaparCSV(item[cab]));
    filasCSV.push(fila.join(","));
  });

  const csvPath = join(process.cwd(), "todas_conversaciones_completas.csv");
  writeFileSync(csvPath, filasCSV.join("\n"), "utf8");
  console.log(`Archivo CSV guardado con éxito en: ${csvPath}`);
}

main().catch(console.error);
