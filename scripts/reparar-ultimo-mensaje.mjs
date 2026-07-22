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

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, key);

  const telefono = "524778110444";

  console.log("=== REPARANDO ÚLTIMO MENSAJE DE SOFÍA ===");

  // 1. Obtener el último mensaje del agente IA
  const { data: mensajes, error: errMsgs } = await sb
    .from("mensajes_whatsapp")
    .select("id, texto")
    .eq("telefono", telefono)
    .eq("direccion", "out")
    .order("created_at", { ascending: false })
    .limit(1);

  if (errMsgs || !mensajes || mensajes.length === 0) {
    console.error("No se encontró el mensaje saliente para reparar.");
    return;
  }

  const msg = mensajes[0];
  console.log("Mensaje crudo a reparar:", msg.texto);

  // 2. Extraer texto limpio y JSON
  let limpio = msg.texto;
  if (limpio.startsWith("```")) {
    limpio = limpio.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  limpio = limpio.trim();

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
    console.error("No se pudo parsear el JSON incluso con el fix:", e.message);
    return;
  }

  // 3. Actualizar mensaje en la base de datos con el texto limpio
  const { error: errUpdateMsg } = await sb
    .from("mensajes_whatsapp")
    .update({ texto: textoRespuesta })
    .eq("id", msg.id);

  if (errUpdateMsg) {
    console.error("Error al actualizar mensaje:", errUpdateMsg.message);
  } else {
    console.log("\n¡Mensaje actualizado con éxito en la BD!");
    console.log("Nuevo texto:", textoRespuesta);
  }

  // 4. Actualizar expediente con los datos extraídos
  const { data: expediente } = await sb
    .from("expedientes")
    .select("id")
    .eq("telefono", telefono)
    .maybeSingle();

  if (expediente && datosExtraidos.paso_flujo) {
    const updates = {
      ultimo_paso_flujo: datosExtraidos.paso_flujo,
      ultimo_paso_alcanzado: "recibio_link" // Paso 4
    };

    const { error: errExp } = await sb
      .from("expedientes")
      .update(updates)
      .eq("id", expediente.id);

    if (errExp) {
      console.error("Error al actualizar expediente:", errExp.message);
    } else {
      console.log("Expediente actualizado con:", updates);
    }
  }
}

main().catch(console.error);
