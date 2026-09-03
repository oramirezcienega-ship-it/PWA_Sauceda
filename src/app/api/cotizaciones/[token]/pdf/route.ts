import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { aCotizacion, aCotizacionConcepto } from "@/app/actions/cotizaciones";
import { generarPdfCotizacion } from "@/lib/cotizacionPdf";
import type { CotizacionConcepto } from "@/lib/types";

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

    // 2. Obtener conceptos
    const { data: concFilas } = await sb
      .from("cotizacion_conceptos")
      .select("*")
      .eq("cotizacion_id", cotizacion.id)
      .order("created_at", { ascending: true });

    const conceptos: CotizacionConcepto[] = (concFilas || []).map(aCotizacionConcepto);

    const siteUrl = process.env.SITE_URL || "https://crm.saucedamx.com";
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
    console.error("Error al generar PDF de cotización:", err);
    return NextResponse.json(
      { error: "Error interno al generar el PDF de la cotización" },
      { status: 500 }
    );
  }
}
