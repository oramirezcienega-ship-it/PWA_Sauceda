import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function cargarEnv() {
  const envContent = readFileSync(".env.local", "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

async function main() {
  cargarEnv();
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log("Comprobando perfiles...");
  const { data, error } = await sb.from("perfiles").select("id, nombre, rol, notificar_whatsapp_nuevo_lead").limit(5);
  if (error) {
    console.log("Columna notificar_whatsapp_nuevo_lead no detectada aún o error:", error.message);
  } else {
    console.log("Columna existente en DB Staging/Desarrollo:", data);
  }
}

main().catch(console.error);
