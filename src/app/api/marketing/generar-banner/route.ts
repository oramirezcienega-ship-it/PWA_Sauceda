import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fotoUrl = searchParams.get("foto") || "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1000";
    const titulo = searchParams.get("titulo") || "IMPERMEABILIZACIÓN Y CONSTRUCCIÓN PROFESIONAL";
    const sub = searchParams.get("sub") || "Instalación en 1 día • Garantía por escrito";

    // Sellos parametrizables dinámicos con colores institucionales de SAUCEDA
    const sello1Top = searchParams.get("sello1_top") || "GARANTÍA";
    const sello1Bot = searchParams.get("sello1_bot") || "10 AÑOS";
    const sello1Color = searchParams.get("sello1_color") || "#2D4A2B"; // Verde Profundo SAUCEDA

    const sello2Top = searchParams.get("sello2_top") || "MARCA";
    const sello2Bot = searchParams.get("sello2_bot") || "GTO";
    const sello2Color = searchParams.get("sello2_color") || "#5C7A52"; // Verde Sauce SAUCEDA

    const sello3Top = searchParams.get("sello3_top") || "CALIDAD";
    const sello3Bot = searchParams.get("sello3_bot") || "PRO 100%";
    const sello3Color = searchParams.get("sello3_color") || "#C9A961"; // Dorado Tierra SAUCEDA

    // Datos de contacto y color destacado dinámicos (Paleta Oficial SAUCEDA)
    const ctaTexto = searchParams.get("cta_texto") || "WhatsApp Directo:";
    const telefono = searchParams.get("telefono") || "477 465 4700";
    const colorDestacado = searchParams.get("color") || "#2D4A2B"; // Verde Profundo por defecto

    // Convertir foto a Base64 server-side para evitar bloqueos CORS del navegador
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
      console.warn("No se pudo convertir foto a base64:", e);
    }

    const tituloUpper = escapeXml(titulo.toUpperCase());
    const subEsc = escapeXml(sub);

    // SVG Institucional Totalmente Parametrizable y Dinámico con Paleta Oficial SAUCEDA
    const svg = `
    <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="footerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${colorDestacado}"/>
          <stop offset="100%" stop-color="#2D4A2B"/>
        </linearGradient>

        <linearGradient id="goldButtonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#C9A961"/>
          <stop offset="100%" stop-color="#E6D5AC"/>
        </linearGradient>

        <linearGradient id="headerSauceda" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2D4A2B"/>
          <stop offset="100%" stop-color="#5C7A52"/>
        </linearGradient>

        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>

      <!-- Fondo Estructurado -->
      <rect width="1080" height="1350" fill="#F8FAFC" />

      <!-- BARRA SUPERIOR DINÁMICA (Sellos de Certificación y Logo SAUCEDA) -->
      <rect x="0" y="0" width="1080" height="160" fill="#FFFFFF" />
      
      <!-- Badges / Sellos de Certificación Parametrizables -->
      <g transform="translate(40, 30)">
        <!-- Sello 1 Dinámico -->
        ${sello1Top ? `
        <rect x="0" y="0" width="125" height="95" rx="12" fill="${sello1Color}" filter="url(#shadow)" />
        <text x="62.5" y="38" font-family="'Inter', sans-serif" font-size="16" font-weight="900" fill="#C9A961" text-anchor="middle">${escapeXml(sello1Top)}</text>
        <text x="62.5" y="70" font-family="'Inter', sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle">${escapeXml(sello1Bot)}</text>
        ` : ''}

        <!-- Sello 2 Dinámico -->
        ${sello2Top ? `
        <rect x="145" y="0" width="130" height="95" rx="12" fill="${sello2Color}" filter="url(#shadow)" />
        <text x="210" y="38" font-family="'Inter', sans-serif" font-size="16" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(sello2Top)}</text>
        <text x="210" y="70" font-family="'Inter', sans-serif" font-size="24" font-weight="900" fill="#C9A961" text-anchor="middle">${escapeXml(sello2Bot)}</text>
        ` : ''}

        <!-- Sello 3 Dinámico -->
        ${sello3Top ? `
        <rect x="290" y="0" width="140" height="95" rx="12" fill="${sello3Color}" filter="url(#shadow)" />
        <text x="360" y="38" font-family="'Inter', sans-serif" font-size="15" font-weight="800" fill="#2D4A2B" text-anchor="middle">${escapeXml(sello3Top)}</text>
        <text x="360" y="70" font-family="'Inter', sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle">${escapeXml(sello3Bot)}</text>
        ` : ''}
      </g>

      <!-- Logo Oficial SAUCEDA Header (Tarjeta Derecha) -->
      <g filter="url(#shadow)" transform="translate(680, 20)">
        <rect x="0" y="0" width="360" height="120" rx="16" fill="url(#headerSauceda)" stroke="#C9A961" stroke-width="4"/>
        <circle cx="65" cy="60" r="42" fill="#C9A961" />
        <text x="65" y="76" font-family="'Inter', sans-serif" font-size="48" font-weight="900" fill="#2D4A2B" text-anchor="middle">S</text>
        <text x="130" y="70" font-family="'Inter', sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" letter-spacing="3">SAUCEDA</text>
        <text x="130" y="98" font-family="'Inter', sans-serif" font-size="13" font-weight="800" fill="#C9A961" letter-spacing="2">BIENES RAÍCES Y CONSTRUCCIÓN</text>
      </g>

      <!-- FOTO CENTRAL FOTORREALISTA DE FLUX -->
      <g filter="url(#shadow)">
        <rect x="35" y="185" width="1010" height="740" rx="16" fill="#CBD5E0" />
        <image href="${base64Foto}" x="40" y="190" width="1000" height="730" preserveAspectRatio="xMidYMid slice" />
      </g>

      <!-- CALLOUT SUPERPUESTO DINÁMICO (Título y Subtítulo de Anuncio) -->
      <g filter="url(#shadow)" transform="translate(50, 890)">
        <rect x="0" y="0" width="980" height="155" rx="20" fill="#FFFFFF" stroke="#2D4A2B" stroke-width="4" />
        
        <text x="40" y="55" font-family="'Inter', sans-serif" font-size="34" font-weight="900" fill="${colorDestacado}">
          ${tituloUpper.substring(0, 42)}
        </text>
        <text x="40" y="105" font-family="'Inter', sans-serif" font-size="26" font-weight="800" fill="#0F172A">
          ${subEsc}
        </text>

        <!-- Sello de Oferta Dinámico SAUCEDA -->
        <g transform="translate(740, 20)">
          <circle cx="100" cy="55" r="55" fill="${colorDestacado}" />
          <text x="100" y="45" font-family="'Inter', sans-serif" font-size="18" font-weight="900" fill="#FFFFFF" text-anchor="middle">COTIZA</text>
          <text x="100" y="75" font-family="'Inter', sans-serif" font-size="24" font-weight="900" fill="#C9A961" text-anchor="middle">GRATIS</text>
        </g>
      </g>

      <!-- BANDA INFERIOR DINÁMICA DE CONTACTO Y CONVERSIÓN -->
      <g filter="url(#shadow)" transform="translate(0, 1070)">
        <rect x="0" y="0" width="1080" height="280" fill="url(#footerGrad)" />
        
        <!-- Botón de WhatsApp -->
        <g transform="translate(50, 45)">
          <rect x="0" y="0" width="480" height="120" rx="60" fill="#25D366" filter="url(#shadow)" />
          <circle cx="65" cy="60" r="35" fill="#FFFFFF" />
          <path d="M65 38 C53 38 43 48 43 60 C43 65 45 69 47 73 L44 84 L55 81 C58 83 62 84 65 84 C77 84 87 74 87 62 C87 48 77 38 65 38 Z" fill="#25D366"/>
          <text x="120" y="52" font-family="'Inter', sans-serif" font-size="20" font-weight="800" fill="#FFFFFF">${escapeXml(ctaTexto)}</text>
          <text x="120" y="92" font-family="'Inter', sans-serif" font-size="38" font-weight="900" fill="#FFFFFF">${escapeXml(telefono)}</text>
        </g>

        <!-- Botón de Atención/Sitio Web Dorado SAUCEDA -->
        <g transform="translate(550, 45)">
          <rect x="0" y="0" width="480" height="120" rx="60" fill="url(#goldButtonGrad)" filter="url(#shadow)" />
          <text x="240" y="52" font-family="'Inter', sans-serif" font-size="20" font-weight="800" fill="#2D4A2B" text-anchor="middle">Atención Inmediata:</text>
          <text x="240" y="92" font-family="'Inter', sans-serif" font-size="34" font-weight="900" fill="#2D4A2B" text-anchor="middle">SAUCEDA.com</text>
        </g>

        <text x="540" y="235" font-family="'Inter', sans-serif" font-size="22" font-weight="800" fill="#C9A961" text-anchor="middle" letter-spacing="2">
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
