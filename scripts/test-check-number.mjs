import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function cargarEnv() {
  try {
    const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const linea of texto.split("\n")) {
      const l = linea.trim();
      if (!l || l.startsWith("#")) continue;
      const i = l.indexOf("=");
      if (i === -1) continue;
      const clave = l.slice(0, i).trim();
      let valor = l.slice(i + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      process.env[clave] = valor;
    }
  } catch (e) {
    console.error("No se pudo cargar .env.local:", e.message);
  }
}

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, key);

  const telefono = "524778110444";

  console.log(`Buscando datos en Staging para el telefono: ${telefono}...`);

  const { data: prospecto } = await sb
    .from("prospectos")
    .select("*")
    .eq("telefono", telefono)
    .maybeSingle();

  console.log("Prospecto coincidente:", prospecto);

  if (prospecto) {
    const { data: expediente } = await sb
      .from("expedientes")
      .select("*")
      .eq("prospecto_id", prospecto.id)
      .maybeSingle();
    console.log("Expediente coincidente:", expediente);
  }

  const { data: mensajes } = await sb
    .from("mensajes_whatsapp")
    .select("direccion, texto, agente, created_at")
    .eq("telefono", telefono)
    .order("created_at", { ascending: true });

  console.log(`Se encontraron ${mensajes?.length || 0} mensajes:`);
  if (mensajes) {
    for (const m of mensajes) {
      console.log(`[${m.direccion === "in" ? "USER" : m.agente || "OUT"}] ${m.texto} (${m.created_at})`);
    }
  }
}

main().catch(console.error);
