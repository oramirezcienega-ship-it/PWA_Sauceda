import type { SupabaseClient } from "@supabase/supabase-js";

/** Genera folio correlativo anual para Orden de Trabajo: OT-2026-0001 */
export async function generarFolioOT(sb: SupabaseClient): Promise<string> {
  const anio = new Date().getFullYear();
  const prefijo = `OT-${anio}-`;

  const { data } = await sb
    .from("ordenes_trabajo")
    .select("folio")
    .ilike("folio", `${prefijo}%`)
    .order("folio", { ascending: false })
    .limit(1);

  let siguienteNum = 1;
  if (data && data.length > 0 && data[0]?.folio) {
    const ultimo = data[0].folio.replace(prefijo, "");
    const parsed = parseInt(ultimo, 10);
    if (!isNaN(parsed)) {
      siguienteNum = parsed + 1;
    }
  }

  return `${prefijo}${String(siguienteNum).padStart(4, "0")}`;
}
