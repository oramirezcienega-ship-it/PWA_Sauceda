import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { aCotizacion, aCotizacionConcepto, aVisitaReporte } from "@/lib/cotizacionesMappers";
import { generarPdfCotizacion, generarPdfReporteVisita } from "@/lib/cotizacionPdf";
import type { CotizacionConcepto, VisitaReporte } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    if (!token) {
      return NextResponse.json({ error: "Token no proporcionado" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") || "cotizacion";

    const sb = supabaseServidor();

    // 1. Obtener la cotización por token
    const { data: cotFila, error: errCot } = await sb
      .from("cotizaciones")
      .select(`
        *,
        prospectos:prospecto_id(id, nombre, primer_apellido, segundo_apellido, correo, telefono, direccion)
      `)
      .eq("token", token)
      .single();

    if (errCot || !cotFila) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }

    const cotizacion = aCotizacion(cotFila);
    const siteUrl = process.env.SITE_URL || "https://crm.saucedamx.com";

    // CASO A: Reporte Técnico de Visita
    if (tipo === "reporte") {
      const { data: repFila } = await sb
        .from("visitas_reportes")
        .select("*, perfiles(nombre)")
        .eq("cotizacion_id", cotizacion.id)
        .maybeSingle();

      if (!repFila) {
        return NextResponse.json({ error: "Reporte técnico no encontrado para esta cotización" }, { status: 404 });
      }

      const reporteVisita: VisitaReporte = aVisitaReporte(repFila);
      const docReporte = generarPdfReporteVisita(cotizacion, reporteVisita, siteUrl);
      const pdfArrayBuffer = docReporte.output("arraybuffer");
      const pdfBuffer = Buffer.from(pdfArrayBuffer);

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Reporte-Tecnico-${cotizacion.id}.pdf"`,
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }

    // CASO B: Cotización / Propuesta Comercial
    const { data: concFilas } = await sb
      .from("cotizacion_conceptos")
      .select("*")
      .eq("cotizacion_id", cotizacion.id)
      .order("created_at", { ascending: true });

    const conceptos: CotizacionConcepto[] = (concFilas || []).map(aCotizacionConcepto);

    const doc = generarPdfCotizacion(cotizacion, conceptos, siteUrl);
    const pdfArrayBuffer = doc.output("arraybuffer");
    const pdfBuffer = Buffer.from(pdfArrayBuffer);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Cotizacion-${cotizacion.id}.pdf"`,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("Error al generar PDF:", err);
    return NextResponse.json(
      { error: "Error interno al generar el PDF" },
      { status: 500 }
    );
  }
}
