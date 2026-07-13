import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Helper para cargar variables locales
function cargarEnvLocal() {
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

// Helper de variantes de teléfono
function normalizarTelefono(tel) {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("521") && d.length === 13) return "52" + d.slice(3);
  if (d.startsWith("52") && d.length >= 12) return d.slice(0, 12);
  if (d.length === 10) return "52" + d;
  return d;
}

function variantesTelefono(tel) {
  const original = (tel || "").trim();
  const canon = normalizarTelefono(original);
  if (!canon) return original ? [original] : [];
  const diez = canon.length >= 10 ? canon.slice(-10) : canon;
  const set = new Set([
    original,
    canon,
    diez,
    "52" + diez,
    "521" + diez,
    "+52" + diez,
    "+521" + diez,
    "+" + canon,
  ]);
  return Array.from(set).filter(Boolean);
}

async function main() {
  cargarEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  const sb = createClient(url, key);
  const telefono = "524775825062"; // Jorge Mtz
  const variantes = variantesTelefono(telefono);
  console.log("Variantes de teléfono:", variantes);

  // 1. Buscar prospecto y expediente
  let prospectoId = "";
  let expedienteId = "";
  try {
    const { data: prospecto } = await sb
      .from("prospectos")
      .select("id, nombre")
      .in("telefono", variantes)
      .maybeSingle();
    
    if (prospecto) {
      prospectoId = prospecto.id;
      console.log(`Prospecto encontrado: ${prospecto.nombre} (${prospecto.id})`);
      
      const { data: exp } = await sb
        .from("expedientes")
        .select("id")
        .eq("prospecto_id", prospecto.id)
        .maybeSingle();
      if (exp) {
        expedienteId = exp.id;
        console.log(`Expediente encontrado: ${exp.id}`);
      }
    } else {
      console.log("No se encontró prospecto por teléfono.");
    }
  } catch (err) {
    console.error("Error al buscar prospecto:", err.message);
  }

  // 2. Realizar consulta OR flexible
  const filtrosOr = [`telefono.in.(${variantes.map(v => `"${v}"`).join(",")})`];
  if (prospectoId) {
    filtrosOr.push(`prospecto_id.eq.${prospectoId}`);
  }
  if (expedienteId) {
    filtrosOr.push(`expediente_id.eq.${expedienteId}`);
  }

  console.log("Filtros OR construidos:", filtrosOr.join(","));

  const { data: msgs, error: errMsgs } = await sb
    .from("mensajes_whatsapp")
    .select("id, telefono, prospecto_id, expediente_id, direccion, texto, created_at")
    .or(filtrosOr.join(","))
    .order("created_at", { ascending: true });

  if (errMsgs) {
    console.error("Error al consultar mensajes:", errMsgs.message);
    return;
  }

  console.log(`Total de mensajes encontrados: ${msgs?.length || 0}`);
  if (msgs && msgs.length > 0) {
    console.log("=== MUESTRA DE MENSAJES ===");
    msgs.slice(0, 3).forEach((m) => {
      console.log(`- [${m.direccion}] (${m.created_at}) ${m.texto?.slice(0, 50)}... [Tel: ${m.telefono}, Prospecto: ${m.prospecto_id}, Exp: ${m.expediente_id}]`);
    });
  }
}

main().catch(console.error);
