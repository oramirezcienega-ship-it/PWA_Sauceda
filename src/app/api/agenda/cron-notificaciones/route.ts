import { NextResponse, type NextRequest } from "next/server";
import { procesarAlertasYResumenesAgenda } from "@/lib/agenda-notificaciones";
import { supabaseServidor } from "@/lib/supabase/server";
import { avanzarSolicitudesAbiertas } from "@/lib/solicitudes-proveedor";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/agenda/cron-notificaciones
 * Disparador programado para:
 *  - Resumen matutino (8:00 AM) de citas del día.
 *  - Resumen nocturno (8:00 PM) de instalaciones/inspecciones del día siguiente.
 *  - Alertas de proximidad (2 horas y 1 hora antes de cada evento).
 *
 * Protegido mediante la variable de entorno CRON_SECRET.
 *
 * Parámetros opcionales (query params):
 *  - secret: Token secreto si no se envía en cabecera Authorization.
 *  - forzar: "matutino" | "nocturno" | "alertas_previas" | "todo" (para pruebas manuales).
 */
async function manejarCron(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    // Validación de seguridad con CRON_SECRET
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      const secretParam = request.nextUrl.searchParams.get("secret");

      const tokenEsperado = `Bearer ${cronSecret}`;
      const esValido = authHeader === tokenEsperado || secretParam === cronSecret;

      if (!esValido) {
        return NextResponse.json(
          { error: "No autorizado. Token de CRON incorrecto o no provisto." },
          { status: 401 }
        );
      }
    }

    const forzar = request.nextUrl.searchParams.get("forzar") as any;

    const resultado = await procesarAlertasYResumenesAgenda({
      forzar: forzar || undefined,
    });

    // Solicitudes a proveedores: vence las que no respondieron y, en cascada, pasa al siguiente
    const solicitudesProveedor = await avanzarSolicitudesAbiertas(supabaseServidor()).catch((e) => {
      console.error("[Cron agenda] Error al avanzar solicitudes a proveedores:", e);
      return 0;
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...resultado,
      solicitudesProveedor,
    });
  } catch (err: any) {
    console.error("Error en la ruta cron de notificaciones de agenda:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error interno al procesar las notificaciones de la agenda.",
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
