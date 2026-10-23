import { NextResponse, type NextRequest } from "next/server";
import { sincronizarMetaAds } from "@/features/marketing/meta-ads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET/POST /api/marketing/cron-meta-ads
 * Tarea programada diaria (Coolify → Scheduled Tasks): baja de Meta Ads el gasto del
 * mes en curso y del anterior, actualiza el Dashboard Inteligente y lo refleja en el
 * estado de resultados. Usa META_ADS_ACCESS_TOKEN y META_AD_ACCOUNT_ID.
 *
 * Protegido con CRON_SECRET (cabecera "Authorization: Bearer <secret>" o ?secret=).
 * Opcional: ?desde=YYYY-MM-DD para recargar meses anteriores.
 */
async function manejarCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const esValido =
      request.headers.get("authorization") === `Bearer ${cronSecret}` ||
      request.nextUrl.searchParams.get("secret") === cronSecret;
    if (!esValido) {
      return NextResponse.json({ error: "No autorizado. Token de CRON incorrecto o no provisto." }, { status: 401 });
    }
  }

  const desde = request.nextUrl.searchParams.get("desde");
  const r = await sincronizarMetaAds({ desde: desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : null });
  console.log("[cron-meta-ads]", JSON.stringify(r));
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  return manejarCron(request);
}

export async function POST(request: NextRequest) {
  return manejarCron(request);
}
