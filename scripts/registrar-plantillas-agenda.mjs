import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const API_VERSION = "v21.0";

const PLANTILLAS = [
  {
    name: "resumen_agenda_diaria",
    category: "UTILITY",
    language: "es_MX",
    components: [
      {
        type: "BODY",
        text: "📅 *Agenda SAUCEDA*\n\nHola {{1}}, {{2}}:\n\n{{3}}\n\nPor favor verifica cualquier cambio o detalle en el sistema CRM.",
        example: {
          body_text: [
            [
              "Oscar",
              "aquí tienes tu resumen de citas e inspecciones para hoy",
              "• 10:00 AM — Inspección Técnica con Roberto Garza (Puerta Real, Tel: 6621234567)"
            ]
          ]
        }
      }
    ]
  },
  {
    name: "recordatorio_cita_asesor",
    category: "UTILITY",
    language: "es_MX",
    components: [
      {
        type: "BODY",
        text: "⏰ *Alerta de Cita Próxima*\n\nHola {{1}}, tienes un evento programado en {{2}}:\n\n• Tipo: {{3}}\n• Cliente: {{4}} ({{5}})\n• Hora: {{6}} hrs\n• Ubicación: {{7}}\n• Notas: {{8}}\n\nRecuerda comunicarte con el cliente con anticipación para confirmar tu traslado.",
        example: {
          body_text: [
            [
              "Oscar",
              "2 horas",
              "Inspección Técnica",
              "Roberto Garza",
              "6621234567",
              "10:00",
              "Fracc. Puerta Real, Privada 3 #45",
              "Revisión de filtración en losa"
            ]
          ]
        }
      }
    ]
  }
];

async function registrarPlantilla(token, wabaId, plantilla) {
  console.log(`\n⏳ Registrando plantilla: ${plantilla.name} (${plantilla.category}) [${plantilla.language}]...`);
  
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(plantilla)
  });

  const body = await res.json();
  if (!res.ok) {
    if (body?.error?.message?.includes("already exists") || body?.error?.error_user_title?.includes("already exists")) {
      console.log(`ℹ️ La plantilla '${plantilla.name}' ya existe en Meta WhatsApp Manager.`);
      return { ok: true, alreadyExists: true };
    }
    console.error(`❌ Error al registrar '${plantilla.name}':`, body?.error?.message || body);
    return { ok: false, error: body?.error };
  }

  console.log(`✅ ¡Plantilla '${plantilla.name}' registrada exitosamente! ID:`, body.id, "Estado:", body.status);
  return { ok: true, id: body.id, status: body.status };
}

async function main() {
  const token = process.env.WHATSAPP_TOKEN;
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (!token || !wabaId) {
    console.error("❌ Error: Faltan las variables WHATSAPP_TOKEN o WHATSAPP_WABA_ID en .env.local");
    process.exit(1);
  }

  console.log(`🚀 Iniciando registro de plantillas en WhatsApp Business Account (WABA: ${wabaId})...`);

  for (const p of PLANTILLAS) {
    await registrarPlantilla(token, wabaId, p);
  }

  console.log("\n🏁 Proceso de registro concluido.");
}

main().catch(console.error);
