import { NextResponse } from "next/server";
import { estimarDimensionesFachada } from "@/lib/ia/estimador-vision";

export const maxDuration = 60; // Hasta 60s para análisis multimodal

export async function POST(req: Request) {
  try {
    let base64Image = "";
    let tipoProyecto: "porton" | "pergola" = "porton";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image") as File | null;
      const type = formData.get("project_type") as string | null;

      if (!file) {
        return NextResponse.json(
          { error: "No se proporcionó ningún archivo de imagen en 'image'." },
          { status: 400 }
        );
      }

      if (type === "pergola" || type === "porton") {
        tipoProyecto = type;
      }

      const buffer = await file.arrayBuffer();
      const base64Str = Buffer.from(buffer).toString("base64");
      const mime = file.type || "image/jpeg";
      base64Image = `data:${mime};base64,${base64Str}`;
    } else {
      const body = await req.json();
      base64Image = body.image || "";
      if (body.project_type === "pergola" || body.project_type === "porton") {
        tipoProyecto = body.project_type;
      }
    }

    if (!base64Image) {
      return NextResponse.json(
        { error: "Falta la imagen a analizar (debe ser base64 o multipart/form-data)." },
        { status: 400 }
      );
    }

    // Ejecutar análisis métrico con visión por computadora
    const resultado = await estimarDimensionesFachada(base64Image, tipoProyecto);

    return NextResponse.json({
      opening_detected: resultado.opening_detected,
      opening_type: resultado.opening_type,
      bounding_box_normalized: resultado.bounding_box_normalized,
      estimated_width_m: resultado.estimated_width_m,
      estimated_height_m: resultado.estimated_height_m,
      estimated_area_sqm: resultado.estimated_area_sqm,
      confidence_score: resultado.confidence_score,
      reference_anchors_used: resultado.reference_anchors_used,
      notes: resultado.notes,
      ...(resultado.error_user_friendly
        ? { error_user_friendly: resultado.error_user_friendly }
        : {}),
    });
  } catch (error: any) {
    console.error("Error en /api/estimator/analyze:", error);
    return NextResponse.json(
      {
        error: error?.message || "Ocurrió un error inesperado al analizar la imagen.",
        opening_detected: false,
      },
      { status: 500 }
    );
  }
}
