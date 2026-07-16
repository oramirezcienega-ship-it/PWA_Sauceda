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
        value = valor.slice(1, -1);
      }
      process.env[clave] = valor;
    }
  } catch (e) {
    console.error("No se pudo cargar .env:", e.message);
  }
}

async function testStaging() {
  cargarEnv();
  console.log("=== INICIANDO PRUEBA COMPLETA EN STAGING ===");
  
  const targetUrl = "https://crm-staging.saucedamx.com/api/captacion/whatsapp";
  const telefonoCliente = "524779998877";

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Limpiar cualquier test previo
  await sb.from("mensajes_whatsapp").delete().eq("telefono", telefonoCliente);
  await sb.from("expedientes").delete().eq("telefono", telefonoCliente);
  await sb.from("prospectos").delete().eq("telefono", telefonoCliente);
  console.log("Historial previo de test limpio.");

  // Preparar payload de Meta simulación WhatsApp
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID_TEST",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: "1186997567823002"
              },
              contacts: [
                {
                  profile: {
                    name: "Lead Staging Prueba"
                  },
                  wa_id: telefonoCliente
                }
              ],
              messages: [
                {
                  from: telefonoCliente,
                  id: "wamid.StagingTestMessage" + Math.floor(Math.random() * 100000),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: {
                    body: "Hola, me interesa impermeabilizar mi casa en León. Mi propiedad está en la colonia Coecillo y son 50 metros cuadrados."
                  },
                  type: "text"
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  console.log(`Enviando petición POST al webhook de staging: ${targetUrl}...`);
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    console.error(`Error al enviar webhook a staging (status ${response.status}):`, await response.text());
    return;
  }

  console.log("¡Petición del webhook de Meta aceptada por Staging exitosamente!");
  console.log("Esperando 12 segundos para dar tiempo a que la IA asíncrona genere la respuesta en Staging...");
  
  await new Promise(resolve => setTimeout(resolve, 12000));

  console.log("\nConsultando base de datos para validar resultados...");

  // 1. Validar Expediente
  const { data: exp, error: errExp } = await sb
    .from("expedientes")
    .select("id, cliente, etapa, tipo_negocio, fraccionamiento, necesidad, ultimo_paso_flujo, ultimo_paso_alcanzado")
    .eq("telefono", telefonoCliente)
    .maybeSingle();

  if (errExp) {
    console.error("Error al consultar expediente:", errExp);
  } else if (!exp) {
    console.warn("¡ALERTA! No se creó el expediente en la base de datos.");
  } else {
    console.log("=== EXPEDIENTE CREADO ===");
    console.log(JSON.stringify(exp, null, 2));
  }

  // 2. Validar Mensajes del chat
  const { data: mensajes, error: errMsgs } = await sb
    .from("mensajes_whatsapp")
    .select("direccion, texto, agente, created_at")
    .eq("telefono", telefonoCliente)
    .order("created_at", { ascending: true });

  if (errMsgs) {
    console.error("Error al consultar mensajes:", errMsgs);
  } else {
    console.log(`\n=== CONVERSACIÓN DE CHAT (${mensajes.length} mensajes) ===`);
    mensajes.forEach(m => {
      console.log(`[${m.direccion.toUpperCase()}] (${m.agente || "Cliente"}): ${m.texto}`);
    });
  }

  console.log("\n=== PRUEBA FINALIZADA ===");
}

testStaging().catch(console.error);
