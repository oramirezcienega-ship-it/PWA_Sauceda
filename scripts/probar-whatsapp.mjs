#!/usr/bin/env node
/**
 * Prueba rápida del envío SALIENTE de WhatsApp (Meta Cloud API).
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/probar-whatsapp.mjs <telefono> ["mensaje opcional"]
 *
 * Ejemplo:
 *   node scripts/probar-whatsapp.mjs 4774654700 "Hola, prueba desde el código"
 *
 * Lee WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID de .env.local (o del entorno).
 *
 * Nota: el texto libre solo se entrega si el destinatario te escribió en las
 * últimas 24 h (ventana de servicio). En modo de prueba, además el número
 * debe estar verificado como destinatario en la app de Meta.
 */

import { readFileSync } from "node:fs";

// Carga simple de .env.local (KEY=VALUE por línea) sin dependencias.
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
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch {
    // Sin .env.local: se usa el entorno tal cual.
  }
}

function normalizarTelefono(tel) {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("521") && d.length === 13) return "52" + d.slice(3);
  if (d.startsWith("52") && d.length >= 12) return d;
  if (d.length === 10) return "52" + d;
  return d;
}

async function main() {
  cargarEnvLocal();

  const telefono = process.argv[2];
  const mensaje =
    process.argv[3] ||
    "Prueba de WhatsApp desde el código de SAUCEDA. ✅ Si lees esto, el envío funciona.";

  if (!telefono) {
    console.error("Falta el teléfono. Uso: node scripts/probar-whatsapp.mjs <telefono> [mensaje]");
    process.exit(1);
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = normalizarTelefono(telefono);

  if (!token || !phoneId) {
    console.error("Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID (en .env.local o el entorno).");
    process.exit(1);
  }

  console.log(`Enviando a ${to} desde phone_number_id ${phoneId}…`);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: true, body: mensaje },
      }),
    },
  );

  const cuerpo = await res.text();
  if (res.ok) {
    console.log("✅ Enviado. Respuesta de Meta:");
  } else {
    console.log(`❌ Error ${res.status}. Respuesta de Meta:`);
  }
  console.log(cuerpo);
}

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});
