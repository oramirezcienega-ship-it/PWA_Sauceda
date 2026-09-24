import { NextResponse, type NextRequest } from "next/server";
import { procesarPublicacionesProgramadasVencidas } from "@/app/actions/marketing";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/marketing/cron-publicar
 * Disparador programado para revisar publicaciones vencidas en la agenda
 * y detonar su publicación automática en Meta (Facebook & Instagram).
 * Protegido opcionalmente mediante la variable de entorno CRON_SECRET.
 */
async function manejarCron(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      const secretParam = request.nextUrl.searchParams.get("secret");
      const tokenEsperado = `Bearer ${cronSecret}`;
      const esValido = authHeader === tokenEsperado || secretParam === cronSecret;
      if (!esValido) {
        return NextResponse.json(
          { error: "No autorizado. Token de CRON incorrecto o faltante." },
          { status: 401 }
        );
      }
    }

    const resultado = await procesarPublicacionesProgramadasVencidas();
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...resultado,
    });
  } catch (err: any) {
    console.error("Error en la ruta cron de marketing:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Error interno al ejecutar el cron de marketing." },
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
