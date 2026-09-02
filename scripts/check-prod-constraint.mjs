import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function cargarEnv(archivo) {
  const envContent = readFileSync(archivo, "utf8");
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
  // Cargar .env.production si existe, si no, .env.local
  try { cargarEnv(".env.production"); } catch { cargarEnv(".env.local"); }
  
  // Forzar con credenciales de producción si existen
  try { cargarEnv(".env.production.local"); } catch {}

  const url = process.env.SUPABASE_URL_PROD || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_PROD || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log("Connecting to:", url?.substring(0, 40) + "...");
  const sb = createClient(url, key);

  // Consultar el constraint actual en la DB
  const { data, error } = await sb.rpc("check_constraint_definition", {}).catch(() => null) ?? {};
  
  // Alternativa: consultar directamente pg_constraint
  const { data: constraints, error: err2 } = await sb
    .from("information_schema.check_constraints")
    .select("constraint_name, check_clause")
    .like("constraint_name", "%tipo_negocio%");
  
  if (err2) {
    console.error("Error:", err2);
  } else {
    console.log("Constraints encontrados:", JSON.stringify(constraints, null, 2));
  }

  // También intentar una update directa de prueba
  console.log("\nProbando update con valor 'construccion-remodelacion'...");
  const { data: testData, error: testErr } = await sb
    .from("expedientes")
    .update({ tipo_negocio: "construccion-remodelacion" })
    .eq("id", "EXP-141")
    .select("id, tipo_negocio");
  
  if (testErr) {
    console.error("❌ Update FALLÓ:", testErr.message);
  } else {
    console.log("✅ Update OK:", testData);
  }
}

main().catch(console.error);
