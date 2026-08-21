import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function cargarEnv() {
  try {
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
  } catch (e) {
    console.log("No .env.local file found or read error:", e.message);
  }
}

async function main() {
  cargarEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key);

  console.log("Aplicando adecuaciones de migración 0069 en Supabase...");

  // 1. Verificar si la columna asignacion_automatica existe o agregarla mediante consulta RPC o verificación
  const { data: perfilesSample, error: errSelect } = await sb
    .from("perfiles")
    .select("id, nombre, asignacion_automatica")
    .limit(5);

  if (errSelect && errSelect.message.includes("asignacion_automatica")) {
    console.log("La columna asignacion_automatica no existe en Supabase.");
    console.log("Sugerencia: Ejecute la migración 0069_asignacion_automatica_lead.sql en la consola SQL de Supabase.");
  } else if (errSelect) {
    console.log("Error al consultar perfiles:", errSelect.message);
  } else {
    console.log("Columna asignacion_automatica detectada en perfiles:", perfilesSample);
    
    // Si ningún perfil tiene asignacion_automatica = true, marcar a Gerardo o al primero
    const tieneAuto = perfilesSample?.some((p) => p.asignacion_automatica === true);
    if (!tieneAuto && perfilesSample && perfilesSample.length > 0) {
      const gerardo = perfilesSample.find((p) => p.nombre?.toLowerCase().includes("gerardo")) || perfilesSample[0];
      const { error: errUpd } = await sb
        .from("perfiles")
        .update({ asignacion_automatica: true })
        .eq("id", gerardo.id);
      if (errUpd) {
        console.error("Error al actualizar asignacion_automatica por defecto:", errUpd.message);
      } else {
        console.log(`Perfil ${gerardo.nombre} (${gerardo.id}) establecido con asignacion_automatica = true`);
      }
    }
  }
}

main().catch(console.error);
