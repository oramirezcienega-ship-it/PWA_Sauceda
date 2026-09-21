import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env.local
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
    console.error("Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const sqlFile = path.resolve(__dirname, "../supabase/migrations/0083_permitir_herreria_piso_estampado_cotizaciones.sql");
  const sqlContent = fs.readFileSync(sqlFile, "utf-8");

  console.log("Aplicando migración 0083 a Staging DB vía /pg/query...");
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sqlContent }),
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error("Error aplicando migración 0083:", responseText);
    process.exit(1);
  }

  console.log("Respuesta de /pg/query:", responseText);
  console.log("¡Migración 0083 aplicada con éxito en Staging DB!");
}

main();
