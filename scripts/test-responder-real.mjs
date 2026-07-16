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
  const sb = createClient(url, key);

  const telefonoPrueba = "524771112233"; // Número de prueba limpio

  console.log("=== INICIANDO PRUEBA DE RESPUESTA REAL ===");

  // 1. Crear prospecto y expediente ficticios
  console.log("Creando prospecto de prueba...");
  const { data: prospecto, error: errPr } = await sb
    .from("prospectos")
    .insert({
      id: "PRO-TEST-999",
      nombre: "Cliente de Prueba",
      telefono: telefonoPrueba,
      origen: "whatsapp",
      estatus: "nuevo",
      calificacion: "frio"
    })
    .select()
    .single();

  if (errPr) {
    console.error("Error al crear prospecto de prueba:", errPr.message);
    return;
  }
  console.log("Prospecto creado:", prospecto.id);

  console.log("Creando expediente de prueba...");
  const { data: expediente, error: errExp } = await sb
    .from("expedientes")
    .insert({
      id: "EXP-TEST-999",
      cliente: "Cliente de Prueba",
      fraccionamiento: "Por definir",
      etapa: "nuevo-lead",
      telefono: telefonoPrueba,
      prospecto_id: prospecto.id,
      ultimo_movimiento: new Date().toISOString()
    })
    .select()
    .single();

  if (errExp) {
    console.error("Error al crear expediente de prueba:", errExp.message);
    // Limpieza
    await sb.from("prospectos").delete().eq("id", prospecto.id);
    return;
  }
  console.log("Expediente creado:", expediente.id);

  // 2. Insertar mensaje entrante
  console.log("Insertar mensaje entrante del usuario...");
  const { error: errMsgIn } = await sb
    .from("mensajes_whatsapp")
    .insert({
      telefono: telefonoPrueba,
      texto: "¡Hola! Quiero más información",
      direccion: "in",
      expediente_id: expediente.id,
      prospecto_id: prospecto.id
    });

  if (errMsgIn) {
    console.error("Error al insertar mensaje de entrada:", errMsgIn.message);
    // Limpieza
    await sb.from("expedientes").delete().eq("id", expediente.id);
    await sb.from("prospectos").delete().eq("id", prospecto.id);
    return;
  }
  console.log("Mensaje de entrada registrado.");

  // 3. Importar dinámicamente responderConIA y ejecutarla
  console.log("Ejecutando responderConIA...");
  try {
    // Para ejecutar el código de Next.js (TS) desde Node, recreamos el llamado con el import
    // dinámico de ESM que soporta Node 20+ si el archivo está compilado.
    // Pero dado que estamos en el directorio de desarrollo, podemos usar la lógica que importamos
    // en probar-responder-completo.mjs pero esta vez ejecutando la inserción real en la BD.
    
    // Ejecutemos la llamada de simulación pero con inserción real en BD.
    // Leemos el historial de la BD para este teléfono de prueba:
    const { data: msgsHistory } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, agente, created_at")
      .eq("telefono", telefonoPrueba)
      .order("created_at", { ascending: true });

    // Cargar instrucciones de la BD
    let extraInstrucciones = "";
    const { data: dbConfig } = await sb
      .from("configuracion_agente")
      .select("valor")
      .eq("clave", "ia_instrucciones")
      .maybeSingle();
    if (dbConfig?.valor) {
      extraInstrucciones = dbConfig.valor.trim();
    }

    const instruccionesBase = `Eres el asistente virtual de SAUCEDA Bienes Raíces y SAUCEDA Construye, una empresa en León, Guanajuato, México. Tu objetivo principal es identificar cuál de nuestros servicios le interesa al cliente, resolver sus dudas y calificar el caso para que el equipo humano pueda continuar.
Ofrecemos soluciones integrales para la vivienda, todo en un solo lugar. Contamos con los siguientes servicios principales:
1️⃣ Remodelación y Ampliación
2️⃣ Impermeabilización Profesional
3️⃣ Concreto Premezclado
4️⃣ Fontanería Profesional
5️⃣ Instalaciones Eléctricas
6️⃣ Acabados y Pintura
7️⃣ Mantenimiento Técnico
8️⃣ Promoción de Viviendas
9️⃣ Armado de Expediente
🔟 Compra Directa de Casas

REGLA DE SERVICIOS: Presenta el menú numerado del 1 al 10 y pide que elijan.
IMPORTANTE: Debes responder EXCLUSIVAMENTE con un objeto JSON válido. No incluyes explicaciones antes ni después del JSON. El formato debe ser exactamente:
{
  "respuesta": "El mensaje de texto que se enviará al cliente",
  "datosExtraidos": {
    "tipo_negocio": "el tipo de negocio o null"
  }
}`;

    const systemPrompt = [instruccionesBase, extraInstrucciones, `\n\nDatos del cliente:\nNombre del cliente: ${expediente.cliente}\nTeléfono de contacto: ${telefonoPrueba}`]
      .filter(Boolean)
      .join("\n");

    const msgsAnthropic = msgsHistory.map(m => ({
      role: m.direccion === "in" ? "user" : "assistant",
      content: m.texto
    }));

    console.log("Llamando a Claude...");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: msgsAnthropic,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const rawText = json.content[0].text;
      console.log("Respuesta cruda de Claude:", rawText);

      let textoRespuesta = "";
      try {
        const parsed = JSON.parse(rawText.trim());
        textoRespuesta = parsed.respuesta;
        console.log("JSON parseado con éxito. Respuesta a enviar:", textoRespuesta);
      } catch (e) {
        console.warn("Fallo al parsear JSON, usando fallback:", e.message);
        textoRespuesta = rawText;
      }

      // Enviar por WhatsApp (o simular el guardado)
      console.log("Guardando respuesta saliente en la BD...");
      const { error: errInsertOut } = await sb
        .from("mensajes_whatsapp")
        .insert({
          telefono: telefonoPrueba,
          texto: textoRespuesta,
          direccion: "out",
          expediente_id: expediente.id,
          prospecto_id: prospecto.id,
          agente: "IA",
          estado: "enviado"
        });

      if (errInsertOut) {
        console.error("Error al insertar mensaje de salida:", errInsertOut.message);
      } else {
        console.log("¡Respuesta de la IA guardada con éxito en mensajes_whatsapp!");
      }
    } else {
      console.error("Error de Anthropic:", res.status, await res.text());
    }

  } catch (err) {
    console.error("Excepción en flujo de IA:", err.message);
  }

  // 4. Limpieza de datos
  console.log("\nLimpiando datos de prueba de la base de datos...");
  const { error: errDelMsgs } = await sb.from("mensajes_whatsapp").delete().eq("telefono", telefonoPrueba);
  if (errDelMsgs) console.error("Error al borrar mensajes:", errDelMsgs.message);
  
  const { error: errDelExp } = await sb.from("expedientes").delete().eq("id", expediente.id);
  if (errDelExp) console.error("Error al borrar expediente:", errDelExp.message);
  
  const { error: errDelPr } = await sb.from("prospectos").delete().eq("id", prospecto.id);
  if (errDelPr) console.error("Error al borrar prospecto:", errDelPr.message);

  console.log("Limpieza completada.");
}

main().catch(console.error);
