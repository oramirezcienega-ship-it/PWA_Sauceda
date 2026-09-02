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

  console.log("Checking all cotizaciones...");
  const { data: quotes, error } = await sb
    .from("cotizaciones")
    .select("id, estatus, prospecto_id, expediente_id");
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log("Cotizaciones status list:", quotes);
}

main().catch(console.error);
