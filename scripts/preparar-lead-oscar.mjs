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
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(url, key);

  const telefono = "524778110444";

  console.log("=== INICIANDO SIMULACIÓN DE LEAD DE TRÁMITE / ASESORÍA INFONAVIT ===");

  // 1. Limpieza de datos previos
  console.log("Limpiando datos previos...");
  await sb.from("mensajes_whatsapp").delete().eq("telefono", telefono);
  await sb.from("expedientes").delete().or("id.eq.EXP-OSCAR-TEST,prospecto_id.eq.PRO-OSCAR-TEST");
  await sb.from("prospectos").delete().eq("id", "PRO-OSCAR-TEST");
  
  // Buscar si hay expediente o prospecto previo por teléfono
  const { data: prevPros } = await sb.from("prospectos").select("id").eq("telefono", telefono);
  if (prevPros && prevPros.length > 0) {
    const ids = prevPros.map(p => p.id);
    await sb.from("expedientes").delete().in("prospecto_id", ids);
    await sb.from("prospectos").delete().in("id", ids);
  }
  
  console.log("Base de datos limpia para pruebas.");

  // 2. Crear prospecto y expediente
  console.log("Creando prospecto de prueba...");
  const { data: prospecto, error: errPr } = await sb
    .from("prospectos")
    .insert({
      id: "PRO-OSCAR-TEST",
      nombre: "Oscar",
      telefono: telefono,
      origen: "whatsapp",
      estatus: "nuevo",
      calificacion: "caliente",
      campaign_name: "SAUCEDA Compra Tramite - Sep 2026",
      ad_name: "Tramite Asesoria Gratis",
      adset_name: "Tramite y Asesoria"
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
      tipo_negocio: "solo_tramite",
      campaign_name: "SAUCEDA Compra Tramite - Sep 2026",
      ad_name: "Tramite Asesoria Gratis",
      adset_name: "Tramite y Asesoria",
      etapa: "nuevo-lead",
      fraccionamiento: "Por definir",
      situacion: "Lead entrante desde campaña de trámite y asesoría Infonavit."
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
  console.log(`Campaña: ${expediente.campaign_name} | Anuncio: ${expediente.ad_name}`);
  console.log("\nAhora puedes abrir tu WhatsApp y enviar cualquier mensaje (por ejemplo: 'Hola, vi su anuncio') al número de WhatsApp de Sauceda (477 465 4700).");
  console.log("Sofía detectará el expediente y te responderá en tiempo real con la bifurcación inicial de trámite/compra.");
}

main().catch(console.error);
