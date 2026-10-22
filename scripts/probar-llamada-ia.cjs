/**
 * Llamada IA de prueba (Sofía por Vapi) a un solo número.
 * Crea un registro marcado como prueba en llamadas_campana y marca de inmediato;
 * no toca cotizaciones ni prospectos.
 *
 * Uso:
 *   node scripts/probar-llamada-ia.cjs <telefono 10 dígitos> [nombre] [servicio] [colonia]
 *
 * Variables (de entorno o de .env.local):
 *   CRON_SECRET   el mismo que tiene el servidor al que se llama (producción)
 *   SITE_URL      opcional, default https://crm.saucedamx.com
 *
 * El resultado (resumen, transcripción, grabación) se ve en Llamadas → Llamadas IA.
 */
const fs = require("fs");
const path = require("path");

function leerEnvLocal() {
  const ruta = path.resolve(__dirname, "../.env.local");
  const vars = {};
  if (!fs.existsSync(ruta)) return vars;
  for (const linea of fs.readFileSync(ruta, "utf-8").split("\n")) {
    const m = linea.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return vars;
}

async function main() {
  const env = { ...leerEnvLocal(), ...process.env };
  const secret = env.CRON_SECRET;
  const base = (env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
  const [telefono, nombre, servicio, colonia] = process.argv.slice(2);

  if (!secret) {
    console.error("Falta CRON_SECRET (variable de entorno o .env.local).");
    process.exit(1);
  }
  if (!telefono || !/^\+?\d[\d\s-]{9,}$/.test(telefono)) {
    console.error("Uso: node scripts/probar-llamada-ia.cjs <telefono 10 dígitos> [nombre] [servicio] [colonia]");
    process.exit(1);
  }

  console.log(`Llamando a ${telefono} vía ${base} …`);
  const res = await fetch(`${base}/api/conmutador/campana`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ telefono, nombre, servicio, colonia }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok || !cuerpo.ok) {
    console.error(`Error ${res.status}:`, cuerpo.error || cuerpo);
    process.exit(1);
  }
  console.log(`Listo: contesta tu teléfono. Registro ${cuerpo.id} (ver en Llamadas → Llamadas IA).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
