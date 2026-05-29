import { NextResponse, type NextRequest } from "next/server";
import { registrarLeadWeb } from "@/features/captacion/web";

// Endpoint de captación del formulario del sitio web (saucedamx.com / Cotizar).
export const dynamic = "force-dynamic";

// CORS abierto para aceptar el envío desde el sitio web.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

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

    // Acepta nombres de campo comunes.
    const nombre = (datos.nombre || datos.name || datos.fullname || "").trim();
    const telefono = (
      datos.telefono ||
      datos.tel ||
      datos.phone ||
      datos.celular ||
      ""
    ).trim();
    const correo = (datos.correo || datos.email || datos.mail || "").trim();
    const mensaje = (
      datos.mensaje ||
      datos.message ||
      datos.comentarios ||
      datos.comentario ||
      ""
    ).trim();

    if (!nombre && !telefono && !correo) {
      return NextResponse.json(
        { ok: false, error: "Faltan datos del lead." },
        { status: 400, headers: CORS },
      );
    }

    await registrarLeadWeb({ nombre, telefono, correo, mensaje });
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (err) {
    console.error("Error en captación web:", err);
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS });
  }
}
