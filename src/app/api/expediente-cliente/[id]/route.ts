import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

function tokenValido(token: string | null, expediente: { session_token_client: string | null; token_expiration: string | null }): boolean {
  if (!token) return false;
  if (expediente.session_token_client !== token) return false;
  if (expediente.token_expiration && new Date(expediente.token_expiration) < new Date()) return false;
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = req.nextUrl.searchParams.get("token");
  const sb = supabaseServidor();

  const { data: exp, error } = await sb
    .from("expedientes")
    .select("*, asesor:asesor_id(nombre)")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !exp) {
    return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
  }

  if (!tokenValido(token, exp as { session_token_client: string | null; token_expiration: string | null })) {
    return NextResponse.json({ error: "token_invalido" }, { status: 401 });
  }

  const { data: promo } = await sb
    .from("promociones_expedientes")
    .select("*")
    .eq("expediente_id", params.id)
    .maybeSingle();

  return NextResponse.json({ expediente: exp, promocion: promo });
}
