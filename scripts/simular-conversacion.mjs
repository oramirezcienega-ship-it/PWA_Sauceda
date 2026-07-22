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

  // 5. Llamar al proveedor seleccionado (Ollama o Claude)
  let proveedor = process.env.IA_PROVEEDOR || "anthropic";
  try {
    const { data: dbProv } = await sb
      .from("configuracion_agente")
      .select("valor")
      .eq("clave", "ia_proveedor")
      .maybeSingle();
    if (dbProv?.valor && ["anthropic", "kimi", "ollama"].includes(dbProv.valor.trim())) {
      proveedor = dbProv.valor.trim();
    }
  } catch (err) {
    console.error("Error al obtener proveedor de la BD en simulación:", err);
  }
  console.log(`[Simulación] Proveedor seleccionado: ${proveedor}`);
  let rawText = "";

  if (proveedor === "ollama") {
    let url = process.env.OLLAMA_URL || "http://192.168.100.253:11434/v1/chat/completions";
    if (url.endsWith("/v1/chat/completions")) {
      url = url.replace("/v1/chat/completions", "/api/chat");
    } else if (!url.endsWith("/api/chat")) {
      url = url.endsWith("/") ? `${url}api/chat` : `${url}/api/chat`;
    }

    const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
    console.log(`Generando respuesta con Ollama local (${model})...`);

    try {
      const messagesOllama = [
        { role: "system", content: systemPrompt },
        ...msgsAnthropic.map(m => ({ role: m.role, content: m.content }))
      ];

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: messagesOllama,
          options: {
            num_ctx: 16384,
            temperature: 0.1,
          },
          stream: false,
        }),
      });

      if (!res.ok) {
        console.error("Error de Ollama:", res.status, await res.text());
        return;
      }

      const json = await res.json();
      rawText = (json.message?.content || "").trim();
      console.log("Respuesta cruda recibida de Ollama.");
    } catch (err) {
      console.error("Excepcion al conectar con Ollama:", err.message);
      return;
    }
  } else if (proveedor === "kimi") {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      console.error("Falta KIMI_API_KEY en .env.local para simular con Kimi.");
      return;
    }
    const baseUrl = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
    const model = process.env.KIMI_MODEL || "kimi-k3";
    console.log(`Generando respuesta con Kimi local/remoto (${model})...`);

    try {
      const messagesOpenAI = [
        { role: "system", content: systemPrompt },
        ...msgsAnthropic.map(m => ({ role: m.role, content: m.content }))
      ];

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: messagesOpenAI,
          temperature: 1,
        }),
      });

      if (!res.ok) {
        console.error("Error de Kimi:", res.status, await res.text());
        return;
      }

      const json = await res.json();
      rawText = (json.choices?.[0]?.message?.content || "").trim();
      console.log("Respuesta cruda recibida de Kimi.");
    } catch (err) {
      console.error("Excepcion al conectar con Kimi:", err.message);
      return;
    }
  } else {
    console.log("Generando respuesta con Claude (Anthropic)...");
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
    rawText = json.content[0].text.trim();
    console.log("Respuesta cruda recibida de Claude.");
  }

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

  // Reemplazar marcadores de cotización y agendamiento si es necesario
  if (textoRespuesta.includes("[LINK_COTIZACION]") || textoRespuesta.includes("[LINK_AGENDADO]")) {
    try {
      let tokenCot = "";
      let idCot = "";
      const { data: cotizacionesExistentes } = await sb
        .from("cotizaciones")
        .select("id, token")
        .eq("expediente_id", expediente.id);

      if (cotizacionesExistentes && cotizacionesExistentes.length > 0) {
        tokenCot = cotizacionesExistentes[0].token;
        idCot = cotizacionesExistentes[0].id;
      } else {
        const { data: todasLasCots } = await sb.from("cotizaciones").select("id");
        const ids = (todasLasCots ?? []).map((c) => c.id);
        const numeros = ids.map((id) => parseInt(id.replace(/\D/g, ""), 10)).filter((n) => !Number.isNaN(n));
        const max = numeros.length ? Math.max(...numeros) : 0;
        idCot = `COT-${String(max + 1).padStart(3, "0")}`;
        const precioM2 = 210;
        const m = datosExtraidos.metros || 75;
        const precioTotal = Number(m) * precioM2;
        const costoM2 = 165;
        const costoTotal = Number(m) * costoM2;

        const { data: nuevaCot, error: errInsertCot } = await sb
          .from("cotizaciones")
          .insert({
            id: idCot,
            prospecto_id: prospecto.id,
            expediente_id: expediente.id,
            servicio_tipo: "impermeabilizacion",
            estatus: "esperando_visita",
            requiere_visita: true,
            precio_final: precioTotal,
            costo_estimado: costoTotal,
            notas_internas: "Creada automáticamente por el chatbot Sofía (Simulador)."
          })
          .select("token")
          .single();

        if (errInsertCot) {
          console.error("Error al insertar cotización en simulación:", errInsertCot.message);
        } else if (nuevaCot) {
          tokenCot = nuevaCot.token;
          await sb.from("cotizacion_conceptos").insert({
            cotizacion_id: idCot,
            descripcion: "Impermeabilización Profesional - Impermeabilizante 3.5 mm + gravilla (5 años de garantía)",
            cantidad: Number(m),
            unidad: "m2",
            precio_unitario: precioM2,
            costo_unitario: costoM2,
            importe: precioTotal
          });
        }
      }

      const siteUrl = "https://crm-staging.saucedamx.com";
      const urlCot = tokenCot ? `${siteUrl}/cotizacion/${tokenCot}` : "";
      const urlAgenda = `${siteUrl}/agenda/inspeccion-general?prospecto_id=${prospecto.id}`;

      textoRespuesta = textoRespuesta
        .replace(/\[LINK_COTIZACION\]/g, urlCot)
        .replace(/\[LINK_AGENDADO\]/g, urlAgenda);
        
      console.log("\n[Simulación] Links de cotización y agenda reemplazados con éxito:");
      console.log(`- Cotización: ${urlCot}`);
      console.log(`- Agenda: ${urlAgenda}`);
    } catch (linkErr) {
      console.error("Error al reemplazar links en simulación:", linkErr);
    }
  }

  // 7. Actualizar base de datos
  const updates = {};
  
  // --- AUTO-AGENDAMIENTO DE INSPECCIÓN EN SIMULADOR ---
  const fechaConfirmada = datosExtraidos.fecha_inspeccion_confirmada;
  const horaConfirmada = datosExtraidos.hora_inspeccion_confirmada;

  if (fechaConfirmada && horaConfirmada) {
    console.log(`[Auto-Scheduling Simulación] Confirmando cita: ${fechaConfirmada} ${horaConfirmada}`);
    const [h, min] = horaConfirmada.split(":");
    const hrsFin = String((parseInt(h, 10) + 1) % 24).padStart(2, "0");
    const horaFin = `${hrsFin}:${min || "00"}:00`;

    const nombreCliente = [expInfo.cliente, "Prueba"].filter(Boolean).join(" ") || "Cliente WhatsApp";

    // Buscar operador Alex
    let operadorId = expInfo.asesor_id || expInfo.operador_id;
    if (!operadorId) {
      try {
        const { data: perfAlex } = await sb
          .from("perfiles")
          .select("id")
          .or("nombre.ilike.%Alex%,nombre.ilike.%Alejandro%")
          .eq("activo", true)
          .maybeSingle();
        if (perfAlex) operadorId = perfAlex.id;
      } catch (err) {
        console.error("Error al buscar Alex en simulación de agenda:", err);
      }
    }

    if (operadorId) {
      try {
        const { data: nuevaCita, error: errCita } = await sb
          .from("agenda_citas")
          .insert({
            perfil_id: operadorId,
            prospecto_id: prospecto.id,
            expediente_id: expediente.id,
            fraccionamiento: expInfo.fraccionamiento ?? null,
            cliente_nombre: nombreCliente,
            cliente_telefono: telefono,
            tipo_cita: "inspeccion",
            fecha: fechaConfirmada,
            hora_inicio: horaConfirmada,
            hora_fin: horaFin,
            notas: "Agendado automáticamente por IA (Simulador)",
            estado: "confirmada",
          })
          .select("id")
          .maybeSingle();

        if (errCita) {
          console.error("Error al crear cita automática en simulación:", errCita.message);
        } else if (nuevaCita?.id) {
          console.log(`[Auto-Scheduling Simulación] Cita creada con ID: ${nuevaCita.id}`);
          const linkCitaConfirmada = `https://crm-staging.saucedamx.com/agenda/cita/${nuevaCita.id}`;
          textoRespuesta = textoRespuesta.replace(/\[LINK_CITA_CONFIRMADA\]/g, linkCitaConfirmada);
          updates.etapa = "visita";
          if (operadorId) {
            updates.asesor_id = operadorId;
          }
        }
      } catch (agErr) {
        console.error("Excepción al auto-agendar cita en simulación:", agErr);
      }
    }
  }
  // Limpiar marcador si no se usó
  textoRespuesta = textoRespuesta.replace(/\[LINK_CITA_CONFIRMADA\]/g, "");

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
