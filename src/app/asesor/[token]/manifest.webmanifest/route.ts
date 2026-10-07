import { NextResponse } from "next/server";

// Manifest por asesor: al instalar el portal en el celular abre su propio link
export function GET(_req: Request, { params }: { params: { token: string } }) {
  const inicio = `/asesor/${encodeURIComponent(params.token)}`;
  return NextResponse.json(
    {
      name: "SAUCEDA · Portal del asesor",
      short_name: "Sauceda Asesor",
      start_url: inicio,
      scope: inicio,
      display: "standalone",
      background_color: "#F5F1E8",
      theme_color: "#2D4A2B",
      icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" }],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } }
  );
}
