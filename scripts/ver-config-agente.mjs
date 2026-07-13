import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function cargarEnvLocal() {
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
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch (e) {
    console.error("No se pudo cargar .env.local:", e.message);
  }
}

async function main() {
  cargarEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.from("configuracion_agente").select("*");
  
  if (error) {
    console.error("Error leyendo configuracion_agente:", error.message);
    process.exit(1);
  }

  console.log("=== CONFIGURACIÓN DEL AGENTE (BASE DE DATOS) ===");
  console.dir(data, { depth: null });
}

main().catch(console.error);
