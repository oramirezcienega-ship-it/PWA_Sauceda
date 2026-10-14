import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cargarEnv(archivo) {
  const ruta = path.resolve(__dirname, "..", archivo);
  if (!fs.existsSync(ruta)) return {};
  const content = fs.readFileSync(ruta, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[match[1].trim()] = val;
    }
  }
  return env;
}

const envLocal = cargarEnv(".env.local");
const envProd = cargarEnv(".env.production");

const url = process.env.SUPABASE_URL_PROD || process.env.SUPABASE_URL || envProd.SUPABASE_URL || envLocal.SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_PROD || process.env.SUPABASE_SERVICE_ROLE_KEY || envProd.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Faltan variables de conexión a Supabase.");
  process.exit(1);
}

console.log("Conectando a Supabase:", url);
const sb = createClient(url, key);

async function ejecutarBackfill() {
  const datosAtribucion = {
    campaign_name: "SAUCEDA Construye Impermeabilizacion - Jul 2026",
    adset_name: "Impermeabilizacion",
    ad_name: "Atribución Pauta Activa 02-Sep",
  };

  console.log("\n1. Buscando prospecto PRO-359 o teléfono 5535059548...");
  const { data: pros, error: errPros } = await sb
    .from("prospectos")
    .select("id, nombre, telefono, campaign_name, adset_name, ad_name")
    .or("id.eq.PRO-359,telefono.ilike.%5535059548%");

  if (errPros) {
    console.error("Error al consultar prospectos:", errPros.message);
  } else {
    console.log(`Prospectos encontrados: ${pros?.length || 0}`);
    if (pros && pros.length > 0) {
      console.log(pros);
      for (const p of pros) {
        const { error: errUpd } = await sb
          .from("prospectos")
          .update(datosAtribucion)
          .eq("id", p.id);
        if (errUpd) console.error(`Error actualizando prospecto ${p.id}:`, errUpd.message);
        else console.log(`✅ Prospecto ${p.id} actualizado correctamente.`);
      }
    }
  }

  console.log("\n2. Buscando expediente EXP-360 o teléfono 5535059548...");
  const { data: exps, error: errExps } = await sb
    .from("expedientes")
    .select("id, cliente, telefono, campaign_name, adset_name, ad_name")
    .or("id.eq.EXP-360,telefono.ilike.%5535059548%");

  if (errExps) {
    console.error("Error al consultar expedientes:", errExps.message);
  } else {
    console.log(`Expedientes encontrados: ${exps?.length || 0}`);
    if (exps && exps.length > 0) {
      console.log(exps);
      for (const e of exps) {
        const { error: errUpd } = await sb
          .from("expedientes")
          .update({
            ...datosAtribucion,
            ultimo_movimiento: new Date().toISOString().split("T")[0],
          })
          .eq("id", e.id);
        if (errUpd) console.error(`Error actualizando expediente ${e.id}:`, errUpd.message);
        else console.log(`✅ Expediente ${e.id} actualizado correctamente.`);
      }
    }
  }

  console.log("\n🏁 Proceso de backfill finalizado.");
}

ejecutarBackfill().catch(console.error);
