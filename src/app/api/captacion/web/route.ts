import { NextResponse, type NextRequest } from "next/server";
import { registrarLeadWeb } from "@/features/captacion/web";

// Endpoint de captación del formulario del sitio web (saucedamx.com / Cotizar).
export const dynamic = "force-dynamic";

// CORS: permitimos el envío desde la landing page (con y sin "www").
const ORIGENES_PERMITIDOS = new Set([
  "https://saucedamx.com",
  "https://www.saucedamx.com",
  "http://localhost:3000", // pruebas locales
]);

// Construye las cabeceras CORS validando el Origin de la petición.
// Solo refleja el origen si coincide con un dominio permitido.
function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin && ORIGENES_PERMITIDOS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const CORS = corsHeaders(request);
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

    const token = await registrarLeadWeb({ nombre, telefono, correo, mensaje });
    return NextResponse.json({ ok: true, token }, { headers: CORS });
  } catch (err) {
    console.error("Error en captación web:", err);
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS });
  }
}
