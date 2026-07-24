import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno de .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Error: Faltan las variables de entorno de Supabase.");
    process.exit(1);
  }

  console.log(`Conectando a Supabase: ${url}`);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("\nConfigurando plantillas de flujos BPM...");

  // 1. Crear flujo para construccion-remodelacion
  const { data: flujo, error: errFlujo } = await supabase
    .from("bpm_flujos")
    .upsert({ tipo_negocio: "construccion-remodelacion", activo: true }, { onConflict: "tipo_negocio" })
    .select("id")
    .single();

  if (errFlujo) {
    console.error("Error al crear flujo:", errFlujo);
    process.exit(1);
  }

  console.log(`Flujo 'construccion-remodelacion' configurado con ID: ${flujo.id}`);

  // 2. Limpiar pasos previos
  await supabase.from("bpm_pasos").delete().eq("flujo_id", flujo.id);

  // 3. Crear pasos para construccion-remodelacion
  const pasos = [
    {
      flujo_id: flujo.id,
      etapa: "visita",
      orden: 1,
      titulo_tarea: "Subir presupuesto técnico",
      descripcion: "El técnico debe ingresar los conceptos y presupuesto de la cotización tras la inspección.",
      rol_responsable: "tecnico",
      dias_vencimiento: 2,
      condicion_activacion: "inmediato"
    },
    {
      flujo_id: flujo.id,
      etapa: "visita",
      orden: 2,
      titulo_tarea: "Preparar propuesta comercial",
      descripcion: "El asesor debe elaborar la propuesta final y enviársela al cliente.",
      rol_responsable: "asesor",
      dias_vencimiento: 3,
      condicion_activacion: "Subir presupuesto técnico"
    }
  ];

  const { error: errPasos } = await supabase.from("bpm_pasos").insert(pasos);
  if (errPasos) {
    console.error("Error al insertar pasos:", errPasos);
    process.exit(1);
  }

  console.log("Pasos del flujo 'construccion-remodelacion' creados exitosamente.");
  console.log("¡Todo listo!");
}

main().catch((err) => {
  console.error("Error crítico:", err);
});
