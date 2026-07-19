import { NextResponse } from "next/server";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await usuarioActual();
    if (!user) {
      return NextResponse.json(
        { ok: false, mensaje: "Debes iniciar sesión en el CRM antes de visitar este endpoint de prueba." },
        { status: 401 }
      );
    }

    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("notificaciones")
      .insert({
        perfil_id: user.id,
        titulo: "🔔 Alerta de Prueba Persistente",
        cuerpo: "Esta es una notificación de prueba para el CRM Sauceda. Permanece en pantalla y hace vibrar tu móvil. ¡Toca aquí para ir al Dashboard!",
        leido: false,
        enlace: "/dashboard"
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      mensaje: "Notificación de prueba creada exitosamente para tu usuario.",
      notificacion: data
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
