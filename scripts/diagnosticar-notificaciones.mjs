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

  console.log("=== INSPECCIÓN DE PERFILES Y TELÉFONOS ===");
  const { data: perfiles, error } = await sb
    .from("perfiles")
    .select("id, nombre, rol, activo, telefono");

  if (error) {
    console.error("Error al consultar perfiles:", error);
    return;
  }

  console.log("Perfiles encontrados:", perfiles);

  const buscando = perfiles?.filter(p => (p.telefono || "").includes("4778110444") || (p.nombre || "").toLowerCase().includes("oscar"));
  console.log("\nPerfiles coincidentes con Oscar o 4778110444:", buscando);
}

main().catch(console.error);
