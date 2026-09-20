import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversaciones/media
 * Proxy para descargar imágenes, stickers, videos y documentos de WhatsApp.
 * Requiere sesión de administrador para seguridad.
 */
export async function GET(request: NextRequest) {
  try {
    // Validar autorización
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");

    if (!mediaId) {
      return NextResponse.json({ error: "Falta mediaId" }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "WhatsApp no está configurado en el servidor" }, { status: 500 });
    }

    // 1. Obtener la URL del archivo multimedia en Meta Graph API
    const infoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!infoRes.ok) {
      console.error(`[Media Proxy] Error al obtener info de Meta (${infoRes.status}):`, await infoRes.text());
      return NextResponse.json({ error: "No se pudo recuperar la información de Meta" }, { status: infoRes.status });
    }

    const info = await infoRes.json() as { url?: string; mime_type?: string };
    if (!info.url) {
      return NextResponse.json({ error: "No se encontró la URL del recurso" }, { status: 404 });
    }

    const contentType = info.mime_type || "application/octet-stream";
    const isRaw = searchParams.get("raw") === "1";
    const isDownload = searchParams.get("download") === "1";
    const filenameParam = searchParams.get("filename");
    const acceptHeader = request.headers.get("accept") || "";

    // Si el usuario navegó directamente a la URL en el navegador / PWA (Accept: text/html) y es una imagen,
    // renderizamos una vista HTML responsiva con botón claro de "Volver al chat" y safe-area para móviles/iOS.
    // Esto previene que en iOS PWA (modo standalone) el usuario quede atrapado en una pantalla blanca sin controles.
    if (!isRaw && !isDownload && acceptHeader.includes("text/html") && contentType.startsWith("image/")) {
      const safeMediaId = encodeURIComponent(mediaId);
      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Visor de Foto - SAUCEDA</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    }
    header {
      padding: max(env(safe-area-inset-top), 16px) 16px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(11, 15, 25, 0.9);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      z-index: 50;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .btn-primary {
      background: #2D4A2B;
      color: #ffffff;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.18);
      color: #f1f5f9;
    }
    .btn:active { transform: scale(0.95); }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px;
      min-height: 0;
      overflow: hidden;
      cursor: pointer;
    }
    .img-wrapper {
      max-width: 100%;
      max-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      max-width: 100%;
      max-height: 75vh;
      object-fit: contain;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      transition: transform 0.2s ease;
    }
    footer {
      padding: 12px 16px max(env(safe-area-inset-bottom), 16px);
      text-align: center;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      background: rgba(11, 15, 25, 0.9);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
  </style>
</head>
<body>
  <header>
    <button class="btn btn-primary" onclick="volver()">
      <span style="font-size: 16px; font-weight: bold;">←</span> Volver a la conversación
    </button>
    <div style="display: flex; gap: 8px;">
      <button class="btn btn-secondary" onclick="rotar()" title="Rotar 90°">
        🔄
      </button>
      <a class="btn btn-secondary" href="?mediaId=${safeMediaId}&download=1" download title="Descargar imagen">
        ⬇️
      </a>
      <button class="btn btn-secondary" onclick="volver()" title="Cerrar">
        ✕
      </button>
    </div>
  </header>
  <main onclick="volver()">
    <div class="img-wrapper" onclick="event.stopPropagation()">
      <img id="foto" src="?mediaId=${safeMediaId}&raw=1" alt="Foto de WhatsApp" />
    </div>
  </main>
  <footer>
    Toca fuera de la foto o pulsa "Volver a la conversación" para regresar
  </footer>
  <script>
    let rot = 0;
    function rotar() {
      rot = (rot + 90) % 360;
      document.getElementById('foto').style.transform = 'rotate(' + rot + 'deg)';
    }
    function volver() {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/conversaciones';
      }
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') volver();
    });
  </script>
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    // 2. Descargar el archivo binario desde Meta
    const fileRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      console.error(`[Media Proxy] Error al descargar el archivo de Meta (${fileRes.status})`);
      return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: fileRes.status });
    }

    const mediaBuffer = await fileRes.arrayBuffer();

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400", // Cachear por 24h
    };

    if (isDownload) {
      const ext = contentType.split("/")[1]?.split(";")[0] || "bin";
      const filename = filenameParam || `whatsapp-${mediaId}.${ext}`;
      headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(filename)}"`;
    }

    return new NextResponse(mediaBuffer, { headers });
  } catch (err: any) {
    console.error("Error en proxy de media de WhatsApp:", err);
    return NextResponse.json(
      { error: err.message || "Error interno al recuperar el recurso" },
      { status: 500 }
    );
  }
}
