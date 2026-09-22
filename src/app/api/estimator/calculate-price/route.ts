import { NextResponse } from "next/server";
import { calcularPresupuestoEstimado, CATALOGO_MODELOS } from "@/lib/cotizador/motor-precios";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { area_sqm, model_id, motor_electrico, cerradura_digital } = body;

    const area = Number(area_sqm);
    if (isNaN(area) || area <= 0) {
      return NextResponse.json(
        { error: "El área en metros cuadrados (area_sqm) debe ser un número positivo." },
        { status: 400 }
      );
    }

    const modeloId = model_id || "porton_duela";
    if (!CATALOGO_MODELOS[modeloId]) {
      return NextResponse.json(
        {
          error: `El modelo '${modeloId}' no es válido. Opciones: ${Object.keys(CATALOGO_MODELOS).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const resultado = calcularPresupuestoEstimado({
      area_sqm: area,
      model_id: modeloId,
      motor_electrico: Boolean(motor_electrico),
      cerradura_digital: Boolean(cerradura_digital),
    });

    return NextResponse.json({
      success: true,
      ...resultado,
    });
  } catch (error: any) {
    console.error("Error en /api/estimator/calculate-price:", error);
    return NextResponse.json(
      { error: error?.message || "Error al calcular el presupuesto." },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Retorna el catálogo completo disponible
  return NextResponse.json({
    catalogo: CATALOGO_MODELOS,
  });
}
