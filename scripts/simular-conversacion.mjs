import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function cargarEnv() {
  try {
    const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
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
    console.error("No se pudo cargar .env.local:", e.message);
  }
}

// Extraer el system prompt base directamente de src/lib/ia/agente.ts
function obtenerSystemPromptBase() {
  const agenteCode = readFileSync(new URL("../src/lib/ia/agente.ts", import.meta.url), "utf8");
  const match = agenteCode.match(/const base = `([\s\S]*?)`;/);
  if (match && match[1]) {
    return match[1];
  }
  throw new Error("No se pudo extraer el system prompt de agente.ts");
}

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, key);

  const telefono = "524778110444";
  const userText = process.argv[2];

  if (!userText) {
    console.error("Por favor, proporciona el mensaje del usuario. Ejemplo: node scripts/simular-conversacion.mjs \"Hola, me interesa\"");
    return;
  }

  console.log(`\n=== SIMULANDO MENSAJE ENTRANTE DEL USUARIO ===`);
  console.log(`Mensaje: "${userText}"`);

  // 1. Obtener prospecto y expediente para asociar los mensajes
  const { data: prospecto } = await sb
    .from("prospectos")
    .select("id")
    .eq("telefono", telefono)
    .maybeSingle();

  const { data: expediente } = await sb
    .from("expedientes")
    .select("id")
    .eq("telefono", telefono)
    .maybeSingle();

  if (!prospecto || !expediente) {
    console.error("Error: No se encontró el prospecto o expediente de prueba. Corre primero 'node scripts/preparar-lead-oscar.mjs'");
    return;
  }

  // 2. Insertar mensaje del usuario (in)
  const { error: errInsertIn } = await sb
    .from("mensajes_whatsapp")
    .insert({
      telefono,
      texto: userText,
      direccion: "in",
      expediente_id: expediente.id,
      prospecto_id: prospecto.id,
      estado: "leido"
    });

  if (errInsertIn) {
    console.error("Error al insertar mensaje de entrada:", errInsertIn.message);
    return;
  }

  // 3. Obtener el historial actualizado
  const { data: msgsHistory } = await sb
    .from("mensajes_whatsapp")
    .select("direccion, texto, agente, created_at")
    .eq("telefono", telefono)
    .order("created_at", { ascending: true });

  const msgsAnthropic = (msgsHistory || []).map(m => ({
    role: m.direccion === "in" ? "user" : "assistant",
    content: m.texto
  }));

  // La API exige que el primer mensaje sea del usuario.
  while (msgsAnthropic.length && msgsAnthropic[0].role === "assistant") {
    msgsAnthropic.shift();
  }

  // 4. Preparar el prompt del sistema
  const basePrompt = obtenerSystemPromptBase();
  
  // Cargar instrucciones extras de la BD
  let extraInstrucciones = "";
  const { data: dbConfig } = await sb
    .from("configuracion_agente")
    .select("valor")
    .eq("clave", "ia_instrucciones")
    .maybeSingle();
  if (dbConfig?.valor) {
    extraInstrucciones = dbConfig.valor.trim();
  }

  // Obtener expediente completo
  const { data: expInfo } = await sb
    .from("expedientes")
    .select("cliente, primer_apellido, fraccionamiento, etapa, situacion, tipo_credito, tipo_negocio, direccion_propiedad, necesidad, valor_estimado, saldo_deuda, telefono, ultimo_paso_flujo, ultimo_paso_alcanzado")
    .eq("id", expediente.id)
    .single();

  const partes = [
    expInfo.cliente && `Nombre del cliente: ${expInfo.cliente}`,
    expInfo.telefono && `Teléfono de contacto: ${expInfo.telefono}`,
    expInfo.tipo_negocio && `Tipo de negocio: ${expInfo.tipo_negocio}`,
    expInfo.etapa && `Etapa del trámite: ${expInfo.etapa}`,
    expInfo.ultimo_paso_flujo && `Último paso de flujo de impermeabilización ejecutado: ${expInfo.ultimo_paso_flujo}`,
    expInfo.ultimo_paso_alcanzado && `Paso del funnel más avanzado alcanzado: ${expInfo.ultimo_paso_alcanzado}`,
  ].filter(Boolean);

  const contexto = `\n\nDatos del cliente:\n${partes.join("\n")}`;

  const instruccionesFlujo = (expInfo.ultimo_paso_flujo)
    ? `\n\nESTADO DE CONVERSIÓN CRÍTICO:\nEl último paso del flujo de impermeabilización que ya ejecutaste con este cliente es "${expInfo.ultimo_paso_flujo}". Está ESTRICTAMENTE PROHIBIDO repetir preguntas, enviar mensajes o solicitar información de este paso o de pasos anteriores. Debes avanzar de inmediato al siguiente paso del flujo.`
    : "";

  const systemPrompt = [basePrompt, extraInstrucciones && `\nIndicaciones adicionales del negocio:\n${extraInstrucciones}`, instruccionesFlujo, contexto]
    .filter(Boolean)
    .join("\n");

  // 5. Llamar a Claude
  console.log("Generando respuesta con Claude...");
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: msgsAnthropic,
    }),
  });

  if (!res.ok) {
    console.error("Error de Anthropic:", res.status, await res.text());
    return;
  }

  const json = await res.json();
  const rawText = json.content[0].text.trim();
  console.log("Respuesta cruda recibida.");

  // 6. Parsear y procesar datos extraídos
  let limpio = rawText;
  if (limpio.startsWith("```")) {
    limpio = limpio.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  limpio = limpio.trim();
  if (limpio.toLowerCase().startsWith("json")) {
    limpio = limpio.slice(4).trim();
  }

  // Si no empieza con {, intentar extraer lo que está entre el primer { y el último }
  if (!limpio.startsWith("{")) {
    const idxInicio = limpio.indexOf("{");
    const idxFin = limpio.lastIndexOf("}");
    if (idxInicio !== -1 && idxFin !== -1 && idxFin > idxInicio) {
      limpio = limpio.slice(idxInicio, idxFin + 1);
    }
  }

  let textoRespuesta = "";
  let datosExtraidos = {};
  try {
    const parsed = JSON.parse(limpio);
    textoRespuesta = parsed.respuesta || "";
    datosExtraidos = parsed.datosExtraidos || {};
  } catch (e) {
    console.warn("Fallo al parsear JSON:", e.message);
    textoRespuesta = rawText;
  }

  console.log(`\n=== RESPUESTA GENERADA DE SOFÍA ===`);
  console.log(textoRespuesta);
  console.log(`\nDatos Extraídos:`, datosExtraidos);

  // 7. Actualizar base de datos
  const updates = {};
  if (datosExtraidos.paso_flujo) {
    updates.ultimo_paso_flujo = datosExtraidos.paso_flujo;
    let pasoAlcanzado = expInfo.ultimo_paso_alcanzado || "lead_entro";
    if (datosExtraidos.paso_flujo === "paso_1") pasoAlcanzado = "respondio_paso1";
    else if (datosExtraidos.paso_flujo === "paso_2") pasoAlcanzado = "vio_precios";
    else if (datosExtraidos.paso_flujo === "paso_3") pasoAlcanzado = "eligio_paquete";
    else if (datosExtraidos.paso_flujo === "paso_4") pasoAlcanzado = "recibio_link";
    updates.ultimo_paso_alcanzado = pasoAlcanzado;
  }

  if (datosExtraidos.metros) {
    const m = datosExtraidos.metros;
    updates.necesidad = `Impermeabilización de ${m} m² - Paquete Estándar ($210/m²)`;
  }

  if (Object.keys(updates).length > 0) {
    await sb.from("expedientes").update(updates).eq("id", expediente.id);
    console.log("Expediente actualizado con:", updates);
  }

  // Insertar respuesta en mensajes (out)
  const { error: errInsertOut } = await sb
    .from("mensajes_whatsapp")
    .insert({
      telefono,
      texto: textoRespuesta,
      direccion: "out",
      expediente_id: expediente.id,
      prospecto_id: prospecto.id,
      agente: "IA",
      estado: "enviado"
    });

  if (errInsertOut) {
    console.error("Error al guardar respuesta saliente:", errInsertOut.message);
  } else {
    console.log("¡Conversación actualizada en la BD!");
  }
}

main().catch(console.error);
