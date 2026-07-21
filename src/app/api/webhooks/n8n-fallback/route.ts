import { NextResponse, type NextRequest } from "next/server";
import { registrarLeadWeb } from "@/features/captacion/web";
import {
  esEmail,
  esTelefonoValido,
  limpiarTelefono,
  limpiarTexto,
} from "@/lib/validacion";

export const dynamic = "force-dynamic";

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { ok: true, message: "Webhook n8n-fallback activo en SAUCEDA." },
    { headers: corsHeaders(request) }
  );
}

export async function POST(request: NextRequest) {
  const CORS = corsHeaders(request);
  try {
    const tipo = request.headers.get("content-type") || "";
    let datos: Record<string, any> = {};
    if (tipo.includes("application/json")) {
      datos = (await request.json()) as Record<string, any>;
    } else {
      const form = await request.formData();
      form.forEach((v, k) => {
        datos[k] = String(v);
      });
    }

    console.log("[Webhook n8n-fallback] Payload recibido:", JSON.stringify(datos));

    // Acepta nombres de campo comunes y sanitiza datos
    const nombre = limpiarTexto(
      datos.nombre || datos.name || datos.fullname || datos.contacto || "Lead del sitio web",
      120
    );
    const telefono = limpiarTelefono(
      datos.telefono || datos.tel || datos.phone || datos.celular
    );
    const correo = limpiarTexto(
      datos.correo || datos.email || datos.mail,
      254
    ).toLowerCase();
    const mensaje = limpiarTexto(
      datos.mensaje || datos.message || datos.comentarios || datos.comentario || datos.descripcion,
      1000
    );
    const tipoCredito = limpiarTexto(
      datos.tipoCredito || datos.tipo_credito || datos.servicio,
      100
    );
    const direccionPropiedad = limpiarTexto(
      datos.direccionPropiedad || datos.direccion_propiedad || datos.direccion || datos.ubicacion,
      300
    );
    const linkGoogleMaps = limpiarTexto(
      datos.linkGoogleMaps || datos.link_google_maps || datos.googleMaps || datos.maps,
      500
    );
    const necesidad = limpiarTexto(
      datos.necesidad || datos.need || datos.motivo || datos.servicioTipo || datos.tipo_servicio,
      300
    );

    const valorEstimadoRaw = datos.valor_estimado ?? datos.valorEstimado;
    const valorEstimado = valorEstimadoRaw !== undefined ? Number(valorEstimadoRaw) || 0 : undefined;

    const saldoDeudaRaw = datos.saldo_deuda ?? datos.saldoDeuda;
    const saldoDeuda = saldoDeudaRaw !== undefined ? Number(saldoDeudaRaw) || 0 : undefined;

    // Si viene correo o teléfono, validamos formato si existe
    if (correo && !esEmail(correo)) {
      console.warn("[Webhook n8n-fallback] Correo inválido:", correo);
    }
    if (telefono && !esTelefonoValido(telefono)) {
      console.warn("[Webhook n8n-fallback] Teléfono inválido:", telefono);
    }

    const token = await registrarLeadWeb({
      nombre: nombre || "Contacto del sitio web",
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

    console.log("[Webhook n8n-fallback] Lead registrado con éxito. Token:", token);

    return NextResponse.json({ ok: true, token, success: true }, { headers: CORS });
  } catch (err) {
    console.error("[Webhook n8n-fallback] Error procesando lead entrante:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error interno" },
      { status: 500, headers: CORS }
    );
  }
}
