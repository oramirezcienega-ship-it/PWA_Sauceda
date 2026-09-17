import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function cargarEnv() {
  const envContent = readFileSync(".env.local", "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, key);

  const res = await sb.from("empresas").select("id").limit(1);
  console.log("Check empresas table:", res);

  const resProspectos = await sb.from("prospectos").select("id, empresa_id").limit(1);
  console.log("Check prospectos.empresa_id:", resProspectos);
}

main().catch(console.error);
