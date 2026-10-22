import { NextResponse, type NextRequest } from "next/server";
import { pdfsDesdeVistas } from "@/lib/pdf-desde-vista";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PDF de un documento público (recibo, póliza, remisión, reporte de visita) renderizado con la
 * misma página que se imprime. Lo usa la app instalada en el teléfono (modo standalone), donde
 * window.print() no hace nada: el PDF se abre con el menú Compartir (Imprimir / Guardar).
 *
 * Solo acepta rutas de documentos públicos por token; nunca rutas del panel.
 */
const RUTAS_PERMITIDAS =
  /^\/(recibo|garantia|cotizacion\/garantia|cotizacion\/remision|orden-trabajo\/remision|reporte-visita)\/[A-Za-z0-9_-]{6,200}$/;

/** Documentos que deben quedar en una sola hoja (igual que al enviarlos por Telegram). */
const UNA_HOJA = /^\/recibo\//;

const siteUrl = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");

function limpiarNombre(nombre: string): string {
  return nombre.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 150) || "Documento";
}

export async function GET(request: NextRequest) {
  const ruta = request.nextUrl.searchParams.get("ruta") || "";
  if (!RUTAS_PERMITIDAS.test(ruta)) {
    return NextResponse.json({ error: "Documento no válido" }, { status: 400 });
  }
  const nombre = limpiarNombre(request.nextUrl.searchParams.get("nombre") || "Documento");

  const bases = [`http://127.0.0.1:${process.env.PORT || 3000}`, siteUrl()];
  const [resultado] = await pdfsDesdeVistas(
    [{ ruta, unaHoja: UNA_HOJA.test(ruta) }],
    bases
  );

  if (!resultado?.pdf) {
    console.warn(`[documento-pdf] No se pudo generar ${ruta}: ${resultado?.motivo}`);
    return NextResponse.json({ error: "No se pudo generar el PDF" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(resultado.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${nombre}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
