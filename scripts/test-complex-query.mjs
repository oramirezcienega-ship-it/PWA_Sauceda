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

  console.log("Running complex select query on cotizaciones...");
  const { data, error } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .eq("prospecto_id", "PRO-138")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("QUERY_ERROR:", error);
  } else {
    console.log("Query success! Data count:", data?.length);
  }
}

main().catch(console.error);
