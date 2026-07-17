import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function cargarEnv() {
  try {
    const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
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
    console.error("No se pudo cargar .env:", e.message);
  }
}

async function main() {
  cargarEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, key);

  const telefono = "524776700542"; // Bertha

  console.log(`Historial completo para el teléfono: ${telefono}`);

  const { data: msgs, error } = await sb
    .from("mensajes_whatsapp")
    .select("*")
    .eq("telefono", telefono)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.table(msgs.map(m => ({
    id: m.id,
    direccion: m.direccion,
    texto: m.texto,
    agente: m.agente || "Vacío",
    created_at: m.created_at,
    finalizado: m.finalizado
  })));
}

main().catch(console.error);
