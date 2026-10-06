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

console.log("Aplicando a Staging:", url);

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
  // Asegurar dependencias previas que faltan en Staging
  await ejecutarSQL("0119_contabilidad_remisiones_centro_costos.sql", "../supabase/migrations/0119_contabilidad_remisiones_centro_costos.sql");
  await ejecutarSQL("0120_centros_costos_subcuentas_marketing.sql", "../supabase/migrations/0120_centros_costos_subcuentas_marketing.sql");
  await ejecutarSQL("0128_leads_en_pausa.sql", "../supabase/migrations/0128_leads_en_pausa.sql");

  // Migraciones de proyecciones
  await ejecutarSQL("0129_fin_proyecciones.sql", "../supabase/migrations/0129_fin_proyecciones.sql");
  await ejecutarSQL("0130_habilitar_rls_tablas_pendientes.sql", "../supabase/migrations/0130_habilitar_rls_tablas_pendientes.sql");
  await ejecutarSQL("seed_proyecciones.sql", "../supabase/seed_proyecciones.sql");
  console.log("\n✅ Todas las migraciones fueron aplicadas con éxito en Staging.");
}

main().catch(console.error);
