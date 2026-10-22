import { NextResponse, type NextRequest } from "next/server";
import { crearLlamadaPrueba, despacharLlamada, despacharPendientes } from "@/features/llamadas-ia/service";

export const dynamic = "force-dynamic";

function autorizado(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.nextUrl.searchParams.get("secret") === secret
  );
}

/**
 * GET /api/conmutador/campana
 * Despachador de llamadas IA aprobadas. En Netlify lo corre la función programada
 * netlify/functions/despachar-llamadas-ia.ts cada 5 min; esta ruta queda para
 * dispararlo a mano o desde otro cron.
 */
export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const r = await despacharPendientes();
  return NextResponse.json({ ok: true, ...r });
}

/**
 * POST /api/conmutador/campana  { telefono, nombre?, servicio?, colonia? }
 * Llamada de prueba a un número propio (la usa scripts/probar-llamada-ia.cjs).
 */
export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body.telefono) return NextResponse.json({ error: "Falta telefono" }, { status: 400 });

  const creada = await crearLlamadaPrueba(body);
  if (!creada.ok || !creada.id) return NextResponse.json({ error: creada.error }, { status: 400 });
  const r = await despacharLlamada(creada.id);
  return NextResponse.json({ id: creada.id, ...r }, { status: r.ok ? 200 : 502 });
}
