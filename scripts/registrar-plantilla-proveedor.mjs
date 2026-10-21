// Registra en Meta la plantilla "aviso_proveedor" (UTILITY, es_MX) con la que se abre la
// conversación con un proveedor por la línea oficial cuando no ha escrito en 24 h.
// El mensaje completo queda en espera y sale en cuanto el proveedor contesta
// (src/lib/whatsapp-proveedores.ts).
//
//   node scripts/registrar-plantilla-proveedor.mjs
//
// Requiere WHATSAPP_TOKEN y WHATSAPP_WABA_ID en .env.local. Meta la revisa (minutos a 1-2 días);
// el estado se ve en WhatsApp Manager → Plantillas de mensajes.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const PLANTILLA = {
  name: "aviso_proveedor",
  category: "UTILITY",
  language: "es_MX",
  components: [
    {
      type: "BODY",
      text:
        "🛠️ *SAUCEDA* · Aviso para proveedor\n\nHola {{1}}, {{2}}\n\nResponde a este mensaje para recibir el detalle completo y confirmarnos de recibido.",
      example: {
        body_text: [
          [
            "Clemente",
            "tienes un servicio confirmado: Mantenimiento de calentador solar, sábado 24 de octubre a las 14:30 h en Campo Fuerte (orden de trabajo OT-2026-0027).",
          ],
        ],
      },
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

  console.log(`⏳ Registrando plantilla ${PLANTILLA.name} en la WABA ${wabaId}...`);
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(PLANTILLA),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.error_user_msg || body?.error?.message || JSON.stringify(body);
    if (/already exists|ya existe/i.test(msg)) {
      console.log(`ℹ️ La plantilla '${PLANTILLA.name}' ya existe en WhatsApp Manager.`);
      return;
    }
    console.error(`❌ Meta rechazó el registro: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ Plantilla enviada a revisión. ID: ${body.id} · Estado: ${body.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
