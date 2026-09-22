import { NextResponse } from "next/server";
import { CATALOGO_MODELOS } from "@/lib/cotizador/motor-precios";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image, project_type, model_id, bounding_box } = body;

    if (!image) {
      return NextResponse.json({ error: "Falta la imagen para inpainting." }, { status: 400 });
    }

    const modelo = CATALOGO_MODELOS[model_id] || CATALOGO_MODELOS["porton_duela"];
    const repToken = process.env.REPLICATE_API_TOKEN;

    // Prompt arquitectónico ultra-específico según el modelo
    let promptIa = "";
    if (project_type === "pergola") {
      promptIa = `A stunning modern luxury outdoor pergola with matte black structural steel IPR beams, vertical square columns standing firmly on the patio ground, ${
        model_id === "pergola_cristal"
          ? "tinted tempered glass roof with subtle sky reflections"
          : model_id === "pergola_bioclimatica"
          ? "contemporary adjustable aluminum louvers"
          : "bronze UV alveolar polycarbonate roof"
      }, warm integrated LED strip lighting, casting realistic soft shadows on the garden lawn and walls, architectural photography, 8k resolution, photorealistic, hyper-detailed, award-winning exterior design.`;
    } else {
      promptIa = `A modern luxury contemporary driveway gate installed perfectly flush between the walls of this house, ${
        model_id === "porton_mixto"
          ? "warm rich teak wood horizontal slats combined with matte black structural steel frame"
          : model_id === "porton_laser"
          ? "laser-cut CNC geometric lattice pattern in dark graphite steel"
          : "horizontal graphite steel slats with micro-reveals and stainless steel vertical door pull"
      }, realistic metal reflections and ambient shadows under lintel, architectural digest photography, hyperrealistic.`;
    }

    // Si hay token de Replicate configurado y activo
    if (repToken && repToken.startsWith("r8_")) {
      try {
        console.log("Invocando Replicate para inpainting fotorrealista...");
        const repRes = await fetch("https://api.replicate.com/v1/predictions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${repToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            version: "stability-ai/stable-diffusion-inpainting:95b776fd4132049dbeff9196b0151121d964f7b2f0a1c8651817478051787834",
            input: {
              image: image,
              prompt: promptIa,
              negative_prompt: "cartoon, flat, 2d, illustration, drawing, blurry, low quality, floating box, disfigured",
              num_outputs: 1,
            },
          }),
        });

        if (repRes.ok) {
          const pred = await repRes.json();
          return NextResponse.json({
            success: true,
            prediction_id: pred.id,
            status: pred.status,
            prompt_used: promptIa,
          });
        }
      } catch (err) {
        console.warn("Error invocando Replicate inpainting:", err);
      }
    }

    return NextResponse.json({
      success: false,
      ai_enabled: false,
      message:
        "Para detonar inpainting neuronal generativo con Flux / Imagen 3 se requiere un token activo en REPLICATE_API_TOKEN o GEMINI_API_KEY. Actualmente se está utilizando el motor de perspectiva 3D arquitectónica en tiempo real.",
      prompt_sugerido: promptIa,
    });
  } catch (err: any) {
    console.error("Error en inpaint API:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
