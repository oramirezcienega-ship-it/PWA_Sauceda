import { NextResponse } from "next/server";
import { listarPlantillasAprobadas } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET /api/health/whatsapp
 * Endpoint de monitoreo (Healthcheck) para validar en tiempo real
 * la vigencia del WHATSAPP_TOKEN y la conectividad con Meta Cloud API en producción.
 */
export async function GET() {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const wabaId = process.env.WHATSAPP_WABA_ID;

    if (!token || !phoneId) {
      return NextResponse.json(
        {
          ok: false,
          status: "unconfigured",
          error: "Faltan las credenciales WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en las variables de entorno de producción.",
          hasToken: Boolean(token),
          tokenLength: token ? token.length : 0,
          phoneId: phoneId || null,
          wabaId: wabaId || null,
        },
        { status: 500 }
      );
    }

    const resPlantillas = await listarPlantillasAprobadas();
    if (!resPlantillas.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "error",
          error: "No se pudo conectar con Meta Cloud API. Es posible que el WHATSAPP_TOKEN haya expirado o sea inválido.",
          detalleMeta: resPlantillas.error,
          tokenPrefix: token.slice(0, 15) + "...",
          tokenLength: token.length,
          phoneId,
          wabaId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: "healthy",
      mensaje: "Conexión exitosa con Meta Cloud API. Las notificaciones por WhatsApp están 100% operativas.",
      plantillasMetaCount: resPlantillas.plantillas?.length ?? 0,
      tokenPrefix: token.slice(0, 15) + "...",
      phoneId,
      wabaId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        status: "exception",
        error: err.message || "Excepción al validar el servicio de WhatsApp.",
      },
      { status: 500 }
    );
  }
}
