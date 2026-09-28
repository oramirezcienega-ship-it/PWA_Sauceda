try { process.loadEnvFile('.env.local'); } catch {}
const N8N_URL = process.env.N8N_API_URL || "https://n8n-staging.saucedamx.com";
const N8N_API_KEY = process.env.N8N_API_KEY || "";

const PROMPT_IMPERMEABILIZACION_1_1 = "Award-winning commercial architectural editorial photography of a modern Mexican residential flat rooftop in sunny León Guanajuato. A skilled Mexican roofing technician in clean navy blue workwear, protective heat-resistant gloves, and safety helmet, applying a heavy roll of torch-on prefabricated waterproofing membrane finished with reflective white mineral granules. He precisely operates a long propane gas blowtorch wand with a bright controlled orange and blue flame, heating and melting the bottom asphalt layer as the roll unrolls seamlessly onto the primed flat concrete roof deck. Visible red propane cylinder tank with hose nearby. In the background, the pristine finished roof surface is covered in clean, neat parallel sheets of white mineral granules reflecting bright natural sunlight. Clear blue sky, crisp architectural lines, shot on Hasselblad H6D-100c, 35mm lens, f/4, authentic craftsmanship, crisp realistic textures, 8k resolution.";

const PROMPT_IMPERMEABILIZACION_9_16 = "Award-winning 9:16 vertical commercial architectural editorial photography of a modern Mexican residential flat rooftop in sunny León Guanajuato. A skilled Mexican roofing technician in clean navy blue workwear, protective heat-resistant gloves, and safety helmet, applying a heavy roll of torch-on prefabricated waterproofing membrane finished with reflective white mineral granules. He precisely operates a long propane gas blowtorch wand with a bright controlled orange and blue flame, heating and melting the bottom asphalt layer as the roll unrolls seamlessly onto the primed flat roof deck. Visible red propane cylinder tank with hose nearby. In the background, the pristine finished roof surface is covered in clean, neat parallel sheets of white mineral granules reflecting bright natural sunlight. Clear blue sky, shot on Hasselblad H6D-100c, 35mm lens, f/4, realistic cinematic composition, 8k resolution.";

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
    "prompt": "={{ (((($json.body.prompt_imagen_flux || '').toLowerCase().includes('roller') || !($json.body.prompt_imagen_flux || '').toLowerCase().includes('torch')) && (($json.body.titulo || '') + ($json.body.contenido || '')).toLowerCase().includes('impermea')) ? '${PROMPT_IMPERMEABILIZACION_1_1}' : ($json.body.prompt_imagen_flux || $json.body.sugerencia_visual || '${PROMPT_IMPERMEABILIZACION_1_1}')).replace(/[\\\"\\n\\r]/g, ' ') }}"
  }
}`;
  }

  if (nodeVid) {
    nodeVid.parameters.jsonBody = `={
  "input": {
    "prompt": "={{ (((($json.body.prompt_imagen_flux || '').toLowerCase().includes('roller') || !($json.body.prompt_imagen_flux || '').toLowerCase().includes('torch')) && (($json.body.titulo || '') + ($json.body.contenido || '')).toLowerCase().includes('impermea')) ? '${PROMPT_IMPERMEABILIZACION_9_16}' : ($json.body.prompt_imagen_flux || $json.body.sugerencia_visual || '${PROMPT_IMPERMEABILIZACION_9_16}')).replace(/[\\\"\\n\\r]/g, ' ') }}",
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
