import { NextResponse, type NextRequest } from "next/server";
import { registrarLeadWeb } from "@/features/captacion/web";
import {
  esEmail,
  esTelefonoValido,
  limpiarTelefono,
  limpiarTexto,
} from "@/lib/validacion";

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

export async function GET(request: NextRequest) {
  const CORS = corsHeaders(request);
  try {
    const sb = (await import("@/lib/supabase/server")).supabaseServidor();
    
    // 1. Obtener perfiles activos
    const { data: perfiles, error: errPerf } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo, telefono")
      .eq("activo", true);
      
    const keysWhatsApp = Object.keys(process.env).filter(k => k.startsWith("WHATSAPP"));

    // 2. Intentar enviar a un número de prueba si viene en los query params
    const telPrueba = request.nextUrl.searchParams.get("telefono");
    let resultadoEnvio = null;
    if (telPrueba) {
      const { enviarWhatsAppPlantilla } = await import("@/lib/whatsapp");
      resultadoEnvio = await enviarWhatsAppPlantilla(
        telPrueba,
        "notificacion_nuevo_lead_v2",
        "es_MX",
        [
          "👤 *Contacto:*\n• Nombre: Prueba Debug\n• Teléfono: " + telPrueba,
          "📍 *Canal e Ingreso:*\n• Canal: debug-api",
          "💰 *Datos Financieros:*\n• Valor Propiedad: $1,000,000\n\n💬 *Detalles:*\nPrueba de depuración."
        ]
      );
    }

    const { listarPlantillasAprobadas } = await import("@/lib/whatsapp");
    const rTemplates = await listarPlantillasAprobadas();

    return NextResponse.json({
      ok: true,
      perfiles,
      errPerf,
      keysWhatsApp,
      templatesList: rTemplates.plantillas,
      templatesError: rTemplates.error,
      resultadoEnvio
    }, { headers: CORS });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message
    }, { status: 500, headers: CORS });
  }
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

    // Acepta nombres de campo comunes y SANITIZA todo en el servidor
    // (no se confía en la validación del navegador).
    const nombre = limpiarTexto(
      datos.nombre || datos.name || datos.fullname,
      120,
    );
    const telefono = limpiarTelefono(
      datos.telefono || datos.tel || datos.phone || datos.celular,
    );
    const correo = limpiarTexto(
      datos.correo || datos.email || datos.mail,
      254,
    ).toLowerCase();
    const mensaje = limpiarTexto(
      datos.mensaje || datos.message || datos.comentarios || datos.comentario,
      1000,
    );
    const tipoCredito = limpiarTexto(
      datos.tipoCredito || datos.tipo_credito || datos.creditType,
      100,
    );
    const direccionPropiedad = limpiarTexto(
      datos.direccionPropiedad || datos.direccion_propiedad || datos.address || datos.direccion,
      300,
    );
    const linkGoogleMaps = limpiarTexto(
      datos.linkGoogleMaps || datos.link_google_maps || datos.googleMaps || datos.maps || datos.ubicacion,
      500,
    );
    const necesidad = limpiarTexto(
      datos.necesidad || datos.need || datos.motivo,
      300,
    );
    const valorEstimadoRaw = datos.valor_estimado ?? datos.valorEstimado;
    const valorEstimado = valorEstimadoRaw !== undefined ? Number(valorEstimadoRaw) || 0 : undefined;

    const saldoDeudaRaw = datos.saldo_deuda ?? datos.saldoDeuda;
    const saldoDeuda = saldoDeudaRaw !== undefined ? Number(saldoDeudaRaw) || 0 : undefined;

    // Debe traer al menos un dato de contacto.
    if (!nombre && !telefono && !correo) {
      return NextResponse.json(
        { ok: false, error: "Faltan datos del lead." },
        { status: 400, headers: CORS },
      );
    }
    // Si viene correo o teléfono, deben tener un formato válido.
    if (correo && !esEmail(correo)) {
      return NextResponse.json(
        { ok: false, error: "El correo no es válido." },
        { status: 400, headers: CORS },
      );
    }
    if (telefono && !esTelefonoValido(telefono)) {
      return NextResponse.json(
        { ok: false, error: "El teléfono no es válido." },
        { status: 400, headers: CORS },
      );
    }

    const token = await registrarLeadWeb({
      nombre,
      telefono,
      correo,
      mensaje,
      tipoCredito,
      direccionPropiedad,
      linkGoogleMaps,
      necesidad,
      valorEstimado,
      saldoDeuda,
    });
    return NextResponse.json({ ok: true, token }, { headers: CORS });
  } catch (err) {
    console.error("Error en captación web:", err);
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS });
  }
}
