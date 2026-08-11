import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fotoUrl = searchParams.get("foto") || "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1000";
    const titulo = searchParams.get("titulo") || "SAUCEDA BIENES RAÍCES";
    const sub = searchParams.get("sub") || "Instalación en 1 día • Garantía por escrito";

    // Generar SVG Profesional Institucional de SAUCEDA con Banner Vendedor
    const svg = `
    <svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0A192F" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#112240" stop-opacity="0.85"/>
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#D4AF37"/>
          <stop offset="100%" stop-color="#F3E5AB"/>
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.4"/>
        </filter>
      </defs>

      <!-- Foto Central de Fondo Fotorrealista de Flux -->
      <image href="${fotoUrl}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice" />

      <!-- Gradiante Superior para Legibilidad del Titulo -->
      <rect x="0" y="0" width="1080" height="320" fill="url(#headerGrad)" />
      
      <!-- Badge Circular del Logo SAUCEDA -->
      <g filter="url(#shadow)">
        <circle cx="160" cy="160" r="95" fill="#0A192F" stroke="#D4AF37" stroke-width="6"/>
        <text x="160" y="175" font-family="'Inter', 'Roboto', sans-serif" font-size="90" font-weight="900" fill="#FFFFFF" text-anchor="middle">S</text>
        <text x="160" y="220" font-family="'Inter', 'Roboto', sans-serif" font-size="20" font-weight="800" fill="#D4AF37" text-anchor="middle" letter-spacing="4">SAUCEDA</text>
      </g>

      <!-- Titulo Publicitario Dinamico -->
      <text x="300" y="140" font-family="'Inter', 'Roboto', sans-serif" font-size="46" font-weight="900" fill="#FFFFFF" width="720">
        ${escapeXml(titulo.substring(0, 38))}
      </text>
      <text x="300" y="195" font-family="'Inter', 'Roboto', sans-serif" font-size="34" font-weight="700" fill="#D4AF37">
        ${escapeXml(titulo.length > 38 ? titulo.substring(38, 75) : "Servicio Profesional en León, Gto.")}
      </text>

      <!-- Badge Inferior Izquierdo 1: Instalación / Traspaso en 1 dia -->
      <g filter="url(#shadow)">
        <rect x="60" y="740" width="420" height="110" rx="25" fill="#FFFFFF" opacity="0.95"/>
        <text x="90" y="785" font-family="'Inter', 'Roboto', sans-serif" font-size="28" font-weight="800" fill="#0A192F">✅ Asesoria &amp; Gestión</text>
        <text x="90" y="825" font-family="'Inter', 'Roboto', sans-serif" font-size="32" font-weight="900" fill="#0A192F">Rápida en 24 Horas</text>
      </g>

      <!-- Badge Inferior Izquierdo 2: Garantia por escrito -->
      <g filter="url(#shadow)">
        <rect x="60" y="875" width="420" height="110" rx="25" fill="#FFFFFF" opacity="0.95"/>
        <text x="90" y="920" font-family="'Inter', 'Roboto', sans-serif" font-size="28" font-weight="800" fill="#0A192F">🛡️ Garantía &amp; Trato</text>
        <text x="90" y="960" font-family="'Inter', 'Roboto', sans-serif" font-size="32" font-weight="900" fill="#0A192F">Directo Sin Trampas</text>
      </g>

      <!-- Boton Dorado de Llamado a la Accion (CTA) WhatsApp -->
      <g filter="url(#shadow)">
        <rect x="520" y="875" width="500" height="110" rx="55" fill="url(#goldGrad)" />
        <circle cx="575" cy="930" r="30" fill="#25D366"/>
        <!-- Icono WhatsApp -->
        <path d="M575 912 C565 912 557 920 557 930 C557 934 558 937 560 940 L558 948 L566 946 C569 948 572 949 575 949 C585 949 593 941 593 931 C593 920 585 912 575 912 Z" fill="#FFFFFF"/>
        <text x="620" y="925" font-family="'Inter', 'Roboto', sans-serif" font-size="26" font-weight="800" fill="#0A192F">Cotiza ahora:</text>
        <text x="620" y="965" font-family="'Inter', 'Roboto', sans-serif" font-size="36" font-weight="900" fill="#0A192F">477 465 4700</text>
      </g>
    </svg>
    `;

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (err: any) {
    console.error("Error al generar Banner SVG:", err);
    return new Response("Error al generar Banner", { status: 500 });
  }
}

function escapeXml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
