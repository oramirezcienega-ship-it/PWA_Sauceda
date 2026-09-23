import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";

const CLIENT_ID = process.env.CANVA_CLIENT_ID || "OC-AaDQNXoWmxXW";
const CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.CANVA_REDIRECT_URI || "http://127.0.0.1:8080/callback";
const SCOPES = "asset:read asset:write brandtemplate:content:read brandtemplate:meta:read design:content:read design:content:write design:meta:read";

const N8N_URL = process.env.N8N_API_URL || "https://n8n-staging.saucedamx.com";
const N8N_API_KEY = process.env.N8N_API_KEY || "";

// 1. Generar PKCE verifier y challenge
const codeVerifier = crypto.randomBytes(48).toString("base64url");
const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

const authUrl = `https://www.canva.com/api/oauth/authorize?` + new URLSearchParams({
  response_type: "code",
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  scope: SCOPES,
  code_challenge: codeChallenge,
  code_challenge_method: "s256"
}).toString();

console.log("\n=======================================================");
console.log("🚀 CANVA OAUTH BRIDGE - SAUCEDA CRM & N8N");
console.log("=======================================================\n");
console.log("1. Asegúrate de tener en Canva Developers -> Outside Canva -> Redirect URLs:");
console.log(`   👉 ${REDIRECT_URI}\n`);
console.log("2. Abriendo navegador o abre este enlace:");
console.log(`   🔗 ${authUrl}\n`);

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, "http://127.0.0.1:8080");
    if (reqUrl.pathname !== "/callback") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const code = reqUrl.searchParams.get("code");
    const error = reqUrl.searchParams.get("error");
    const errorDesc = reqUrl.searchParams.get("error_description");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #c00;">⚠️ Falta guardar la URL en Canva</h2>
          <p>Canva dice: <em>${errorDesc}</em></p>
          <p>Ve a <strong>Canva Developers -> Outside Canva -> Redirect URLs</strong>, agrega <code>${REDIRECT_URI}</code> y haz clic en <strong>Save changes</strong>.</p>
          <p><a href="${authUrl}" style="background: #2D4A2B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reintentar Autorización</a></p>
        </div>
      `);
      console.error(`⚠️ Canva reportó: ${errorDesc}`);
      console.log(`➡️ Guarda "${REDIRECT_URI}" en Canva Developers y vuelve a abrir:`);
      console.log(`   🔗 ${authUrl}\n`);
      return;
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("No authorization code found");
      return;
    }

    console.log("✅ Código de autorización recibido de Canva. Intercambiando por tokens...");

    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const tokenRes = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
        code: code,
        redirect_uri: REDIRECT_URI
      }).toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("❌ Error al obtener token de Canva:", tokenData);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>Error al canjear token</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
      server.close();
      return;
    }

    console.log("🎉 ¡Token de Canva obtenido exitosamente!");
    console.log("   Tipo:", tokenData.token_type);
    console.log("   Expira en:", tokenData.expires_in, "segundos");
    console.log("   Tiene refresh_token:", Boolean(tokenData.refresh_token));

    // Guardar o actualizar en n8n como Credencial Header Auth para Canva
    try {
      const credBody = {
        name: "Canva API Token",
        type: "httpHeaderAuth",
        data: {
          name: "Authorization",
          value: `Bearer ${tokenData.access_token}`
        }
      };

      const n8nRes = await fetch(`${N8N_URL}/api/v1/credentials`, {
        method: "POST",
        headers: {
          "X-N8N-API-KEY": N8N_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(credBody)
      });
      const n8nJson = await n8nRes.json();
      console.log("✅ Credencial registrada en n8n con éxito:", n8nJson.id || n8nJson.name);
    } catch (n8nErr) {
      console.warn("⚠️ No se pudo registrar automáticamente en n8n, pero el token es válido:", n8nErr.message);
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #2D4A2B;">🎉 ¡Conexión con Canva Exitosa!</h1>
        <p style="font-size: 18px; color: #333;">La licencia de Canva ha quedado vinculada y autorizada para SAUCEDA.</p>
        <p style="color: #666;">Ya puedes cerrar esta pestaña y volver a la consola.</p>
      </div>
    `);

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 2000);

  } catch (err) {
    console.error("Error en servidor local:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error: " + err.message);
    server.close();
  }
});

server.listen(8080, "127.0.0.1", () => {
  console.log("🌐 Servidor local escuchando en http://127.0.0.1:8080/callback");
  // Intentar abrir el navegador automáticamente en Windows
  exec(`start "" "${authUrl}"`, (err) => {
    if (err) console.log("Abre manualmente el enlace mostrado arriba.");
  });
});
