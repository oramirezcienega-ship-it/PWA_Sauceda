import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fotoUrl = searchParams.get("foto") || "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1000";
    const titulo = searchParams.get("titulo") || "IMPERMEABILIZACIÓN Y CONSTRUCCIÓN PROFESIONAL";
    const sub = searchParams.get("sub") || "Instalación en 1 día • Garantía hasta 10 años por escrito";

    // Obtener la foto de Replicate server-side y convertir a Base64 para evitar bloqueos CORS del navegador
    let base64Foto = fotoUrl;
    try {
      if (fotoUrl.startsWith("http")) {
        const imgRes = await fetch(fotoUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const mime = imgRes.headers.get("content-type") || "image/jpeg";
          base64Foto = `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
        }
      }
    } catch (e) {
      console.warn("No se pudo convertir foto a base64, usando URL directa:", e);
    }

    const tituloUpper = escapeXml(titulo.toUpperCase());
    const subEsc = escapeXml(sub);

    // SVG Institucional Estilo Anuncio Vendedor (Estilo VIPROCOSA / Marca GTO / SAUCEDA)
    const svg = `
    <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="redFooterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#C53030"/>
          <stop offset="50%" stop-color="#9B2C2C"/>
          <stop offset="100%" stop-color="#742A2A"/>
        </linearGradient>

        <linearGradient id="goldButtonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#D4AF37"/>
          <stop offset="100%" stop-color="#F3E5AB"/>
        </linearGradient>

        <linearGradient id="headerNavy" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0A192F"/>
          <stop offset="100%" stop-color="#112240"/>
        </linearGradient>

        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>

      <!-- Fondo Blanco de Estructura -->
      <rect width="1080" height="1350" fill="#F7FAFC" />

      <!-- BARRA SUPERIOR INSTITUCIONAL (Sellos de Calidad y Logo SAUCEDA) -->
      <rect x="0" y="0" width="1080" height="160" fill="#FFFFFF" />
      
      <!-- Badges de Certificacion Estilo VIPROCOSA / Marca GTO -->
      <g transform="translate(40, 30)">
        <!-- Sello 1: Garantia -->
        <rect x="0" y="0" width="120" height="95" rx="12" fill="#0A192F" />
        <text x="60" y="40" font-family="'Inter', sans-serif" font-size="18" font-weight="900" fill="#D4AF37" text-anchor="middle">GARANTÍA</text>
        <text x="60" y="70" font-family="'Inter', sans-serif" font-size="24" font-weight="900" fill="#FFFFFF" text-anchor="middle">10 AÑOS</text>

        <!-- Sello 2: Marca GTO -->
        <rect x="140" y="0" width="130" height="95" rx="12" fill="#1A365D" />
        <text x="205" y="38" font-family="'Inter', sans-serif" font-size="16" font-weight="800" fill="#FFFFFF" text-anchor="middle">MARCA</text>
        <text x="205" y="72" font-family="'Inter', sans-serif" font-size="28" font-weight="900" fill="#D4AF37" text-anchor="middle">GTO</text>

        <!-- Sello 3: Calidad SAUCEDA -->
        <rect x="285" y="0" width="140" height="95" rx="12" fill="#0A192F" />
        <text x="355" y="38" font-family="'Inter', sans-serif" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle">CALIDAD</text>
        <text x="355" y="72" font-family="'Inter', sans-serif" font-size="22" font-weight="900" fill="#38A169" text-anchor="middle">PRO 100%</text>
      </g>

      <!-- Logo Oficial SAUCEDA Header (Tarjeta Derecha) -->
      <g filter="url(#shadow)" transform="translate(680, 20)">
        <rect x="0" y="0" width="360" height="120" rx="16" fill="url(#headerNavy)" stroke="#D4AF37" stroke-width="4"/>
        <circle cx="65" cy="60" r="42" fill="#D4AF37" />
        <text x="65" y="76" font-family="'Inter', sans-serif" font-size="48" font-weight="900" fill="#0A192F" text-anchor="middle">S</text>
        <text x="130" y="70" font-family="'Inter', sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" letter-spacing="3">SAUCEDA</text>
        <text x="130" y="98" font-family="'Inter', sans-serif" font-size="14" font-weight="800" fill="#D4AF37" letter-spacing="2">BIENES RAÍCES Y CONSTRUCCIÓN</text>
      </g>

      <!-- FOTO CENTRAL FOTORREALISTA DE FLUX (Con Marco de Calidad) -->
      <g filter="url(#shadow)">
        <rect x="35" y="185" width="1010" height="740" rx="16" fill="#CBD5E0" />
        <image href="${base64Foto}" x="40" y="190" width="1000" height="730" preserveAspectRatio="xMidYMid slice" />
      </g>

      <!-- CALLOUT SUPERPUESTO ESTILO ANUNCIO VENDEDOR (Abajo de la foto) -->
      <g filter="url(#shadow)" transform="translate(50, 890)">
        <!-- Banner Titular de Anuncio -->
        <rect x="0" y="0" width="980" height="155" rx="20" fill="#FFFFFF" stroke="#0A192F" stroke-width="4" />
        
        <!-- Texto de Anuncio Vendedor -->
        <text x="40" y="55" font-family="'Inter', sans-serif" font-size="36" font-weight="900" fill="#C53030">
          ${tituloUpper.substring(0, 42)}
        </text>
        <text x="40" y="105" font-family="'Inter', sans-serif" font-size="28" font-weight="800" fill="#0A192F">
          ${subEsc}
        </text>

        <!-- Sello Rojo de Oferta "COTIZA HOY" -->
        <g transform="translate(740, 20)">
          <circle cx="100" cy="55" r="55" fill="#C53030" />
          <text x="100" y="45" font-family="'Inter', sans-serif" font-size="18" font-weight="900" fill="#FFFFFF" text-anchor="middle">COTIZA</text>
          <text x="100" y="75" font-family="'Inter', sans-serif" font-size="24" font-weight="900" fill="#F3E5AB" text-anchor="middle">GRATIS</text>
        </g>
      </g>

      <!-- BANDA INFERIOR ROJA DE CONTACTO DIRECTO (Estilo VIPROCOSA) -->
      <g filter="url(#shadow)" transform="translate(0, 1070)">
        <rect x="0" y="0" width="1080" height="280" fill="url(#redFooterGrad)" />
        
        <!-- Boton de WhatsApp Grande -->
        <g transform="translate(50, 45)">
          <rect x="0" y="0" width="480" height="120" rx="60" fill="#25D366" filter="url(#shadow)" />
          <circle cx="65" cy="60" r="35" fill="#FFFFFF" />
          <!-- Icono WhatsApp -->
          <path d="M65 38 C53 38 43 48 43 60 C43 65 45 69 47 73 L44 84 L55 81 C58 83 62 84 65 84 C77 84 87 74 87 62 C87 48 77 38 65 38 Z" fill="#25D366"/>
          <text x="120" y="52" font-family="'Inter', sans-serif" font-size="22" font-weight="800" fill="#FFFFFF">WhatsApp Directo:</text>
          <text x="120" y="92" font-family="'Inter', sans-serif" font-size="38" font-weight="900" fill="#FFFFFF">477 465 4700</text>
        </g>

        <!-- Boton de Llamada / Cotización -->
        <g transform="translate(550, 45)">
          <rect x="0" y="0" width="480" height="120" rx="60" fill="url(#goldButtonGrad)" filter="url(#shadow)" />
          <text x="240" y="52" font-family="'Inter', sans-serif" font-size="22" font-weight="800" fill="#0A192F" text-anchor="middle">Atención Inmediata:</text>
          <text x="240" y="92" font-family="'Inter', sans-serif" font-size="36" font-weight="900" fill="#0A192F" text-anchor="middle">SAUCEDA.com</text>
        </g>

        <!-- Pie de Pagina de Ubicación en León, Gto. -->
        <text x="540" y="235" font-family="'Inter', sans-serif" font-size="22" font-weight="800" fill="#F3E5AB" text-anchor="middle" letter-spacing="2">
          📍 LEÓN, GUANAJUATO • TRASPASOS INFONAVIT • IMPERMEABILIZACIÓN • COMPRA DE CASAS
        </text>
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
