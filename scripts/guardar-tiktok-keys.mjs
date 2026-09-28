import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Leer variables de .env.local si no están en process.env
if (!process.env.SUPABASE_URL && fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[k] = v;
      }
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan variables de Supabase");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "awmdc8eykliowwv8";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "zaHwMRXoRG27BopKhJHLvIo0H74kxNNJ";

  console.log("Guardando credenciales de TikTok en configuracion_agente...");

  const { error: errKey } = await supabase.from("configuracion_agente").upsert(
    { clave: "tiktok_client_key", valor: clientKey },
    { onConflict: "clave" }
  );

  const { error: errSec } = await supabase.from("configuracion_agente").upsert(
    { clave: "tiktok_client_secret", valor: clientSecret },
    { onConflict: "clave" }
  );

  if (errKey || errSec) {
    console.error("Error al guardar:", errKey || errSec);
  } else {
    console.log("✅ Credenciales de TikTok guardadas exitosamente en la base de datos.");
  }
}

main();
