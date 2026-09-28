import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env.local
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

const token = process.env.WHATSAPP_TOKEN;
const wabaId = process.env.WHATSAPP_WABA_ID;

async function main() {
  const res = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) {
    console.error("Error Meta:", data.error);
    return;
  }
  console.log("Total plantillas encontradas:", data.data?.length);
  (data.data || []).forEach((p) => {
    console.log(`- ${p.name} [${p.language}] (${p.status}) - ${p.category}`);
  });
}

main().catch(console.error);
