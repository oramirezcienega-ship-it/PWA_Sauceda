import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manual env parsing from .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Faltan las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const sqlFile = path.resolve(__dirname, "../supabase/migrations/0071_sincronizar_etapas_prospecto_expediente.sql");
  const sqlContent = fs.readFileSync(sqlFile, "utf-8");

  console.log("Aplicando migración 0071 a Staging DB...");
  const { data, error } = await supabase.rpc("ejecutar_sql_desarrollo", { sql_query: sqlContent });

  if (error) {
    console.error("Error aplicando migración 0071:", error.message);
    process.exit(1);
  }

  console.log("¡Migración 0071 aplicada con éxito en Staging DB!");
}

main().catch(console.error);
