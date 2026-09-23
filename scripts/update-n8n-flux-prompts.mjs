try { process.loadEnvFile('.env.local'); } catch {}
const N8N_URL = process.env.N8N_API_URL || "https://n8n-staging.saucedamx.com";
const N8N_API_KEY = process.env.N8N_API_KEY || "";

async function main() {
  const getRes = await fetch(`${N8N_URL}/api/v1/workflows/PljwKAgcjvjsw1F5`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY }
  });
  const wf = await getRes.json();

  const nodeImg = wf.nodes.find(n => n.name === "HTTP: Crear Imagen Replicate");
  const nodeVid = wf.nodes.find(n => n.name === "HTTP: Crear Imagen Video");

  if (nodeImg) {
    nodeImg.parameters.jsonBody = `={
  "input": {
    "prompt": "={{ ($json.body.prompt_imagen_flux || $json.body.sugerencia_visual || 'Award-winning commercial architectural editorial photography of a modern Mexican residential home in sunny León Guanajuato, warm natural sunlight, clear blue sky, Hasselblad H6D-100c, 35mm lens, f/4, crisp realistic composition, 8k resolution').replace(/[\\\"\\n\\r]/g, ' ') }}"
  }
}`;
  }

  if (nodeVid) {
    nodeVid.parameters.jsonBody = `={
  "input": {
    "prompt": "={{ ($json.body.prompt_imagen_flux || $json.body.sugerencia_visual || 'Award-winning 9:16 vertical commercial architectural editorial photography of a modern Mexican residential home in sunny León Guanajuato, warm natural sunlight, clear blue sky, Hasselblad H6D-100c, 35mm lens, f/4, realistic cinematic composition, 8k resolution').replace(/[\\\"\\n\\r]/g, ' ') }}",
    "aspect_ratio": "9:16"
  }
}`;
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
  console.log("n8n Workflow updated successfully:", updated.id, "Active:", updated.active);
}

main().catch(console.error);
