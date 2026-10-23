import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { buscarFamilia, cargarFamiliasSeguridad } from "@/lib/ia/catalogo-seguridad";
import { generarImagenComparativaSeguridad } from "@/lib/ia/imagen-comparativa-seguridad";
import { enviarYRegistrar, yaEnviado } from "@/lib/ia/imper-envios";

/**
 * Envía la imagen comparativa de una familia de seguridad (videoporteros, cerraduras…), una sola
 * vez por expediente y familia. Best-effort: si algo falla, la conversación de texto sigue igual.
 */
export async function enviarComparativaSeguridad(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; agente: string; familia: string }
): Promise<boolean> {
  try {
    const familia = buscarFamilia(await cargarFamiliasSeguridad(sb, { soloAptosIa: true }), ctx.familia);
    if (!familia) return false;
    const marca = `Opciones de ${familia.nombre.toLowerCase()}`;
    if (await yaEnviado(sb, ctx.expedienteId, marca)) return false;

    const png = await generarImagenComparativaSeguridad(familia);
    const ok = await enviarYRegistrar(sb, ctx, png, "image/png", `Opciones-${familia.clave}.png`, `${marca}. Precios sin factura (con factura se agrega IVA).`);
    if (ok && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: `Sofía envió la comparativa de ${familia.nombre.toLowerCase()}`,
        detalle: familia.productos.map((p) => p.nombre).join(" · "),
      });
    }
    return ok;
  } catch (err) {
    console.error("[Seguridad] Error al enviar la comparativa:", err);
    return false;
  }
}
