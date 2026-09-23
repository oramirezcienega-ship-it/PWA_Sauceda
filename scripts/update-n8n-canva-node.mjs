const N8N_URL = process.env.N8N_API_URL || "https://n8n-staging.saucedamx.com";
const N8N_API_KEY = process.env.N8N_API_KEY || "";

async function main() {
  const getRes = await fetch(`${N8N_URL}/api/v1/workflows/PljwKAgcjvjsw1F5`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY }
  });
  const wf = await getRes.json();

  // Filtrar nodos viejos
  wf.nodes = wf.nodes.filter(n => n.name !== "Canva: Conectar Cuenta" && n.name !== "Canva: Subir a Galería");

  // Crear nodo de subida a Canva
  const canvaUploadNode = {
    id: "canva-upload-flux",
    name: "Canva: Subir a Galería",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 3,
    position: [0, -320],
    parameters: {
      method: "POST",
      url: "https://api.canva.com/rest/v1/url-asset-uploads",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={\n  \"name\": \"{{ ($node['Webhook CRM Sauceda'].json.body.titulo || 'Sauceda Publicacion').substring(0, 50) }}\",\n  \"url\": \"{{ Array.isArray($json.output) ? $json.output[0] : ($json.output || '') }}\"\n}"
    },
    credentials: {
      httpHeaderAuth: {
        id: "LbrbKpWbASaTq3uO",
        name: "Canva API Token"
      }
    }
  };

  wf.nodes.push(canvaUploadNode);

  // Encontrar la clave de switch "¿Imagen lista?"
  const switchKey = Object.keys(wf.connections).find(k => k.includes("Imagen lista") && !k.includes("Video"));
  if (switchKey && wf.connections[switchKey] && wf.connections[switchKey].main) {
    const mainOutputs = wf.connections[switchKey].main;
    if (mainOutputs[0]) {
      const alreadyHas = mainOutputs[0].some(conn => conn.node === "Canva: Subir a Galería");
      if (!alreadyHas) {
        mainOutputs[0].push({ node: "Canva: Subir a Galería", type: "main", index: 0 });
      }
    }
  }

  const putRes = await fetch(`${N8N_URL}/api/v1/workflows/PljwKAgcjvjsw1F5`, {
    method: "PUT",
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: { executionOrder: "v1" }
    })
  });

  const updated = await putRes.json();
  console.log("Workflow updated successfully:", updated.id, updated.name, "Active:", updated.active);
}

main().catch(console.error);
