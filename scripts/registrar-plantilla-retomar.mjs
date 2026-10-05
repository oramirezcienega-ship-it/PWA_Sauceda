import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Registra en Meta la plantilla que se envía cuando un negocio en pausa llega a su fecha
 * para retomar (ver src/lib/pausa-leads.ts). Meta la revisa antes de poder usarla.
 *
 *   node scripts/registrar-plantilla-retomar.mjs
 *
 * Parámetros: {{1}} primer nombre del cliente, {{2}} servicio (ej. "impermeabilización").
 * El nombre que usa el sistema se configura en configuracion_agente.plantilla_retomar_pausa.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1].trim()] = value;
    }
  });
}

const API_VERSION = "v21.0";

const PLANTILLA = {
  name: "retomar_proyecto_pausa",
  category: "MARKETING",
  language: "es_MX",
  components: [
    {
      type: "BODY",
      text: "¡Hola {{1}}! Te saluda Sofía de SAUCEDA. 👋\n\nComo quedamos, te escribo para retomar tu proyecto de {{2}}.\n\n¿Te gustaría que lo retomemos? Con gusto un asesor te ayuda con lo que necesites.",
      example: { body_text: [["Antonio", "impermeabilización"]] },
    },
    {
      type: "BUTTONS",
      buttons: [
        { type: "QUICK_REPLY", text: "Sí, retomemos" },
        { type: "QUICK_REPLY", text: "Más adelante" },
      ],
    },
  ],
};

async function main() {
  const token = process.env.WHATSAPP_TOKEN;
  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!token || !wabaId) {
    console.error("❌ Faltan WHATSAPP_TOKEN o WHATSAPP_WABA_ID en .env.local");
    process.exit(1);
  }

  console.log(`⏳ Registrando plantilla '${PLANTILLA.name}' en WABA ${wabaId}...`);
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(PLANTILLA),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.error_user_msg || body?.error?.message || JSON.stringify(body);
    if (/already exists|ya existe/i.test(msg)) {
      console.log(`ℹ️ La plantilla '${PLANTILLA.name}' ya existe en Meta.`);
      return;
    }
    console.error("❌ Error al registrar:", msg);
    process.exit(1);
  }
  console.log(`✅ Registrada. ID: ${body.id} · Estado: ${body.status} (Meta la revisa; suele tardar de minutos a 24 h).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
