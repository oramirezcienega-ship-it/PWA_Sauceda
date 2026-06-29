import { NextResponse, type NextRequest } from "next/server";
import { registrarLeadTikTok } from "@/features/captacion/tiktok";
import {
  esEmail,
  limpiarTelefono,
  limpiarTexto,
} from "@/lib/validacion";

// Webhook de captación de TikTok Lead Ads.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const tipo = request.headers.get("content-type") || "";
    let datos: Record<string, string> = {};
    
    if (tipo.includes("application/json")) {
      datos = (await request.json()) as Record<string, string>;
    } else {
      const form = await request.formData();
      form.forEach((v, k) => {
        datos[k] = String(v);
      });
    }

    // Limpieza y sanitización de datos
    const nombre = limpiarTexto(
      datos.nombre || datos.name || datos.fullname || datos.full_name,
      120,
    );
    const telefono = limpiarTelefono(
      datos.telefono || datos.tel || datos.phone || datos.celular || datos.phone_number,
    );
    const correo = limpiarTexto(
      datos.correo || datos.email || datos.mail,
      254,
    ).toLowerCase();
    const mensaje = limpiarTexto(
      datos.mensaje || datos.message,
      1000,
    );
    const campaign_name = limpiarTexto(
      datos.campaign_name || datos.campaignName || datos.campaign || datos.campaña,
      200,
    );
    const adset_name = limpiarTexto(
      datos.adset_name || datos.adsetName || datos.adgroup || datos.conjuntoAnuncios,
      200,
    );
    const ad_name = limpiarTexto(
      datos.ad_name || datos.adName || datos.ad || datos.anuncio,
      200,
    );

    // Validación básica: necesitamos nombre y teléfono obligatoriamente
    if (!nombre || !telefono) {
      return NextResponse.json(
        { ok: false, error: "Nombre y teléfono son obligatorios para registrar el lead." },
        { status: 400 },
      );
    }

    if (correo && !esEmail(correo)) {
      return NextResponse.json(
        { ok: false, error: "El formato de correo no es válido." },
        { status: 400 },
      );
    }

    // Registra el lead en el CRM
    const token = await registrarLeadTikTok({
      nombre,
      telefono,
      correo: correo || undefined,
      mensaje: mensaje || undefined,
      campaign_name: campaign_name || undefined,
      adset_name: adset_name || undefined,
      ad_name: ad_name || undefined,
    });

    return NextResponse.json({ ok: true, token });
  } catch (err) {
    console.error("Error en endpoint de captación TikTok:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar el lead." },
      { status: 500 },
    );
  }
}
