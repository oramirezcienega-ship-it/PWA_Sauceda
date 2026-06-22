import { NextResponse, type NextRequest } from "next/server";
import { orquestador } from "@/lib/automatizaciones/orquestador";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/secuencias/cron
 * Disparador periódico para el orquestador de marketing automation.
 * Protegido mediante la variable de entorno CRON_SECRET.
 */
async function manejarCron(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    
    // Si la clave está configurada en variables de entorno, validarla
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      const secretParam = request.nextUrl.searchParams.get("secret");
      
      const tokenEsperado = `Bearer ${cronSecret}`;
      const esValido = authHeader === tokenEsperado || secretParam === cronSecret;
      
      if (!esValido) {
        return NextResponse.json(
          { error: "No autorizado. Token incorrecto o faltante." },
          { status: 401 }
        );
      }
    }

    // Ejecutar el orquestador
    const resultado = await orquestador();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...resultado,
    });
  } catch (err: any) {
    console.error("Error en la ruta cron de secuencias:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error interno al ejecutar el orquestador.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return manejarCron(request);
}

export async function POST(request: NextRequest) {
  return manejarCron(request);
}
