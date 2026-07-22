import { readFileSync } from "node:fs";

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
  
  const url = "http://192.168.100.253:11434/v1/chat/completions";
  const model = "qwen2.5:7b";

  console.log(`Intentando conectar con Ollama en ${url} usando el modelo ${model}...`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 20,
        messages: [{ role: "user", content: "Hola, responde brevemente con un saludo." }],
      }),
    });

    if (res.ok) {
      const json = await res.json();
      console.log("\n¡Conexión con Ollama local exitosa! ✓");
      console.log("Respuesta de Ollama:", json.choices?.[0]?.message?.content);
    } else {
      console.error(`Error: Ollama respondió con código ${res.status}`);
      console.error(await res.text());
    }
  } catch (err) {
    console.error("\nNo se pudo establecer conexión con Ollama en esa dirección IP.");
    console.error("Detalle del error:", err.message);
  }
}

main().catch(console.error);
