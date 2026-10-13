import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env.local
const envPath = path.resolve(__dirname, "../.env.local");
let url = "", serviceKey = "";
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim().replace(/^['"]|['"]$/g, "");
      if (key === "SUPABASE_URL" || key === "NEXT_PUBLIC_SUPABASE_URL") url = value;
      if (key === "SUPABASE_SERVICE_ROLE_KEY") serviceKey = value;
    }
  });
}

console.log("Aplicando migración 0147 a Staging:", url);

async function ejecutarSQL(nombre, rutaRelativa) {
  const sqlFile = path.resolve(__dirname, rutaRelativa);
  if (!fs.existsSync(sqlFile)) {
    console.log(`Archivo no encontrado: ${nombre}, saltando.`);
    return;
  }
  const sqlContent = fs.readFileSync(sqlFile, "utf-8");

  console.log(`\n--- Ejecutando ${nombre} ---`);
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ query: sqlContent })
  });

  const txt = await res.text();
  console.log(`Respuesta [status ${res.status}]:`, txt.slice(0, 300));
  if (res.status !== 200) {
    throw new Error(`Fallo en ${nombre}: ${txt}`);
  }
}

async function main() {
  await ejecutarSQL("0147_proveedor_productos_tarifas_capacidad.sql", "../supabase/migrations/0147_proveedor_productos_tarifas_capacidad.sql");
  console.log("✅ Migración 0147 aplicada con éxito en Staging.");
}

main().catch((err) => {
  console.error("Error al aplicar migración:", err);
  process.exit(1);
});
