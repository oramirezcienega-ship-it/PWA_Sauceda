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

  console.log("=== INICIANDO SIMULACIÓN DE LEAD DE IMPERMEABILIZACIÓN ===");

  // 1. Limpieza de datos previos
  console.log("Limpiando datos previos...");
  await sb.from("mensajes_whatsapp").delete().eq("telefono", telefono);
  
  // Buscar si hay expediente o prospecto previo
  const { data: prevPros } = await sb.from("prospectos").select("id").eq("telefono", telefono);
  if (prevPros && prevPros.length > 0) {
    const ids = prevPros.map(p => p.id);
    await sb.from("expedientes").delete().in("prospecto_id", ids);
    await sb.from("prospectos").delete().in("id", ids);
  }
  
  console.log("Base de datos limpia para pruebas.");

  // 2. Crear prospecto y expediente ficticios
  console.log("Creando prospecto de prueba...");
  const { data: prospecto, error: errPr } = await sb
    .from("prospectos")
    .insert({
      id: "PRO-OSCAR-TEST",
      nombre: "Oscar",
      telefono: telefono,
      origen: "whatsapp",
      estatus: "nuevo",
      calificacion: "frio"
    })
    .select()
    .single();

  if (errPr) {
    console.error("Error al crear prospecto:", errPr.message);
    return;
  }
  console.log("Prospecto creado:", prospecto.id);

  console.log("Creando expediente de prueba...");
  const { data: expediente, error: errExp } = await sb
    .from("expedientes")
    .insert({
      id: "EXP-OSCAR-TEST",
      prospecto_id: prospecto.id,
      cliente: "Oscar",
      telefono: telefono,
      tipo_negocio: "construccion-impermeabilizacion",
      etapa: "nuevo-lead",
      fraccionamiento: ""
    })
    .select()
    .single();

  if (errExp) {
    console.error("Error al crear expediente:", errExp.message);
    return;
  }
  console.log("Expediente creado:", expediente.id);

  console.log("\n¡Emulación de Lead completada con éxito!");
  console.log(`Prospecto: ${prospecto.nombre} (${prospecto.telefono})`);
  console.log(`Expediente ID: ${expediente.id} | Tipo Negocio: ${expediente.tipo_negocio} | Etapa: ${expediente.etapa}`);
  console.log("\nAhora puedes abrir tu WhatsApp y enviar cualquier mensaje (por ejemplo: 'Hola, me interesa impermeabilizar') al número de prueba de WhatsApp.");
  console.log("Sofía detectará el expediente y te responderá en tiempo real siguiendo el nuevo flujo.");
}

main().catch(console.error);
