import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sb = supabaseServidor();
    
    // 1. Obtener perfiles activos
    const { data: perfiles, error: errPerf } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo, telefono")
      .eq("activo", true);
      
    // 2. Intentar enviar a un número de prueba si viene en los query params
    const telPrueba = request.nextUrl.searchParams.get("telefono");
    let resultadoEnvio = null;
    if (telPrueba) {
      resultadoEnvio = await enviarWhatsAppPlantilla(
        telPrueba,
        "notificacion_nuevo_lead_v2",
        "es",
        [
          "👤 *Contacto:*\n• Nombre: Prueba Debug\n• Teléfono: " + telPrueba,
          "📍 *Canal e Ingreso:*\n• Canal: debug-api",
          "💰 *Datos Financieros:*\n• Valor Propiedad: $1,000,000\n\n💬 *Detalles:*\nPrueba de depuración."
        ]
      );
    }

    return NextResponse.json({
      ok: true,
      perfiles,
      errPerf,
      resultadoEnvio
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message
    }, { status: 500 });
  }
}
