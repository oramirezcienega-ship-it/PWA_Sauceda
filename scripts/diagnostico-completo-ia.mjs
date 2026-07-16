import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  const sb = createClient(url, key);

  console.log("=== DIAGNÓSTICO DEL BOT SOFÍA ===");

  // 1. Verificar variables de entorno
  console.log("Variables de entorno locales en .env:");
  console.log("- ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "Definida" : "No definida");
  console.log("- ANTHROPIC_MODEL:", process.env.ANTHROPIC_MODEL || "No definido (usará default)");
  console.log("- IA_AGENTE:", process.env.IA_AGENTE || "No definido");

  // 2. Verificar configuración en la base de datos (tabla configuracion_agente)
  console.log("\nConsultando configuracion_agente en la base de datos...");
  const { data: configAgente, error: errConfig } = await sb
    .from("configuracion_agente")
    .select("*");

  if (errConfig) {
    console.error("Error al consultar configuracion_agente:", errConfig.message);
  } else {
    console.log("Registros en configuracion_agente:");
    console.dir(configAgente, { depth: null });
  }

  // 3. Probar conexión directa con Anthropic (Ping)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const modelo = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  
  if (apiKey) {
    console.log(`\nProbando conexión con Anthropic usando el modelo: ${modelo}...`);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      });

      if (res.ok) {
        const json = await res.json();
        console.log("Conexión exitosa con Anthropic ✓");
        console.log("Respuesta de Anthropic:", JSON.stringify(json.content));
      } else {
        const text = await res.text();
        console.error(`Error de Anthropic (${res.status}):`, text);
      }
    } catch (e) {
      console.error("Excepción al conectar con Anthropic:", e.message);
    }
  } else {
    console.log("\nNo se puede probar Anthropic porque falta ANTHROPIC_API_KEY.");
  }

  // 4. Analizar los últimos mensajes entrantes de WhatsApp y respuestas del Bot
  console.log("\nAnalizando los últimos mensajes en mensajes_whatsapp...");
  const { data: ultimosMensajes, error: errMsgs } = await sb
    .from("mensajes_whatsapp")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (errMsgs) {
    console.error("Error al consultar mensajes_whatsapp:", errMsgs.message);
  } else {
    console.log("Últimos 10 mensajes en la base de datos:");
    console.table(ultimosMensajes.map(m => ({
      id: m.id,
      telefono: m.telefono,
      direccion: m.direccion,
      texto: m.texto?.slice(0, 40) + (m.texto?.length > 40 ? "..." : ""),
      agente: m.agente || "Vacío",
      created_at: m.created_at,
      finalizado: m.finalizado
    })));
  }
}

main().catch(console.error);
