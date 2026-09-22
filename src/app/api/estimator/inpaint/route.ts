import { NextResponse } from "next/server";
import { CATALOGO_MODELOS } from "@/lib/cotizador/motor-precios";
import { crearMascaraPng } from "@/lib/ia/crear-mascara";

export const maxDuration = 60; // Hasta 60s para inferencia de Flux Fill

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image, project_type, model_id, geometry } = body;

    if (!image) {
      return NextResponse.json({ error: "Falta la imagen para inpainting." }, { status: 400 });
    }

    const rawToken = process.env.REPLICATE_API_TOKEN || "";
    const token = rawToken.trim().replace(/^["']|["']$/g, "");

    if (!token) {
      return NextResponse.json(
        {
          error: "No hay REPLICATE_API_TOKEN configurado en las variables de entorno.",
        },
        { status: 500 }
      );
    }

    const modelo = CATALOGO_MODELOS[model_id] || CATALOGO_MODELOS["porton_duela"];

    // 1. Prompts fotorrealistas de alta fidelidad arquitectónica
    let promptIa = "";
    if (project_type === "pergola") {
      if (model_id === "pergola_cristal") {
        promptIa =
          "A sleek modern luxury architectural pergola made of dark graphite structural steel with a tinted tempered glass roof, dark steel posts standing firmly on the garden patio lawn, warm hidden LED perimeter lights, casting soft realistic shadows on the grass, architectural digest photograph, ultra photorealistic, 8k resolution, award-winning exterior design";
      } else if (model_id === "pergola_bioclimatica") {
        promptIa =
          "A luxury contemporary bioclimatic pergola with adjustable aluminum louvers in matte black, integrated warm perimeter lights, steel columns rooted in the patio, architectural photograph, ultra photorealistic, 8k resolution";
      } else {
        promptIa =
          "A heavy-duty contemporary architectural pergola made of dark steel IPR beams with a bronze UV alveolar polycarbonate roof, steel columns on the lawn, realistic shadows, architectural digest photograph, photorealistic";
      }
    } else {
      if (model_id === "porton_mixto") {
        promptIa =
          "A contemporary luxury driveway gate combining warm natural teak wood horizontal slats and matte black structural steel framing, installed flush between the garage walls of this house, realistic morning shadows, architectural photography, 8k";
      } else if (model_id === "porton_laser") {
        promptIa =
          "A modern minimalist driveway gate with intricate laser-cut CNC geometric lattice pattern in dark charcoal steel, stainless steel lock, flush installation in garage opening, architectural photography, 8k";
      } else {
        promptIa =
          "A luxury modern contemporary driveway gate made of horizontal graphite steel duela slats with micro-reveals, stainless steel vertical door pull, seamlessly installed between the walls of this garage, realistic shadows and metallic finish, architectural photography, 8k";
      }
    }

    // 2. Construir la máscara PNG a partir de los puntos geométricos
    let puntosMascara: Array<[number, number]>;
    if (geometry?.p_techo_izq && geometry?.p_techo_der && geometry?.p_piso_der && geometry?.p_piso_izq) {
      puntosMascara = [
        [geometry.p_techo_izq.x, geometry.p_techo_izq.y],
        [geometry.p_techo_der.x, geometry.p_techo_der.y],
        [geometry.p_piso_der.x, geometry.p_piso_der.y],
        [geometry.p_piso_izq.x, geometry.p_piso_izq.y],
      ];
    } else {
      // Coordenadas por defecto para el vano central
      puntosMascara =
        project_type === "pergola"
          ? [
              [0.16, 0.22],
              [0.84, 0.18],
              [0.82, 0.8],
              [0.18, 0.84],
            ]
          : [
              [0.12, 0.2],
              [0.88, 0.2],
              [0.88, 0.88],
              [0.12, 0.88],
            ];
    }

    const maskBuffer = crearMascaraPng(600, 400, puntosMascara);
    const maskBase64 = "data:image/png;base64," + maskBuffer.toString("base64");

    console.log("Detonando Flux Fill en Replicate con prompt:", promptIa);

    // 3. Iniciar predicción en Replicate (black-forest-labs/flux-fill-dev)
    const repRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "a053f84125613d83e65328a289e14eb6639e10725c243e8fb0c24128e5573f4c", // flux-fill-dev
        input: {
          image: image,
          mask: maskBase64,
          prompt: promptIa,
          num_inference_steps: 28,
          guidance: 30,
          output_format: "png",
          output_quality: 90,
        },
      }),
    });

    if (!repRes.ok) {
      const errText = await repRes.text();
      console.error("Error al iniciar Replicate prediction:", repRes.status, errText);
      return NextResponse.json(
        { error: `Error de Replicate (${repRes.status}): ${errText}` },
        { status: 500 }
      );
    }

    const prediction = await repRes.json();
    const predictionId = prediction.id;

    // 4. Polling hasta completar la inferencia (máximo 45 segundos)
    let current = prediction;
    const startTime = Date.now();

    while (
      current.status !== "succeeded" &&
      current.status !== "failed" &&
      current.status !== "canceled" &&
      Date.now() - startTime < 48000
    ) {
      await new Promise((r) => setTimeout(r, 1500));
      const checkRes = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (checkRes.ok) {
        current = await checkRes.json();
      }
    }

    if (current.status === "succeeded") {
      const outputUrl = Array.isArray(current.output)
        ? current.output[0]
        : current.output;

      return NextResponse.json({
        success: true,
        image_url: outputUrl,
        prompt_used: promptIa,
      });
    } else {
      console.error("Inpainting falló o excedió tiempo:", current.error);
      return NextResponse.json(
        {
          error: current.error || "El modelo no completó la generación a tiempo.",
          status: current.status,
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("Error inesperado en inpaint API:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
