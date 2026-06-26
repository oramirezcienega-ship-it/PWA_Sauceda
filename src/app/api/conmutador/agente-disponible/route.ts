import { NextResponse } from "next/server";
import { obtenerAgenteDisponible } from "@/features/conmutador/service";

export const dynamic = "force-dynamic";

async function handler() {
  try {
    const agente = await obtenerAgenteDisponible();
    if (agente) {
      return NextResponse.json({
        disponible: true,
        nombre: agente.nombre,
      });
    } else {
      return NextResponse.json({
        disponible: false,
        mensaje: "No hay asesores disponibles en este horario o todos están ocupados.",
      });
    }
  } catch (error) {
    console.error("Error en API agente-disponible:", error);
    return NextResponse.json({
      disponible: false,
      error: String(error),
    }, { status: 500 });
  }
}

export async function GET() {
  return handler();
}

export async function POST() {
  return handler();
}
