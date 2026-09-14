import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken) {
    return NextResponse.json({ error: "CRON_SECRET no configurado en el servidor." }, { status: 500 });
  }

  const tokenQuery = req.nextUrl.searchParams.get("token");
  const isAuthorized = 
    (authHeader === `Bearer ${expectedToken}`) || 
    (tokenQuery === expectedToken);

  if (!isAuthorized) {
    console.warn("[Limpiar Test] Intento de acceso no autorizado.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const telefono = req.nextUrl.searchParams.get("telefono") || "524172702864";

  try {
    console.log(`[Limpiar Test] Iniciando limpieza en BD Staging para teléfono: ${telefono}`);
    const sb = supabaseServidor();

    // Borrado secuencial de registros en cascada
    const r1 = await sb.from("mensajes_whatsapp").delete().eq("telefono", telefono);
    const r2 = await sb.from("expedientes").delete().eq("telefono", telefono);
    const r3 = await sb.from("prospectos").delete().eq("telefono", telefono);

    console.log(`[Limpiar Test] Limpieza completada para: ${telefono}`, {
      mensajes: r1.error ? r1.error.message : "Ok",
      expedientes: r2.error ? r2.error.message : "Ok",
      prospectos: r3.error ? r3.error.message : "Ok"
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Historial de test para ${telefono} eliminado de la base de datos con éxito.`,
      detalles: {
        mensajes: r1.error ? r1.error.message : "Borrados",
        expedientes: r2.error ? r2.error.message : "Borrados",
        prospectos: r3.error ? r3.error.message : "Borrados"
      }
    });
  } catch (err) {
    console.error("[Limpiar Test] Error en el endpoint de limpieza:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
