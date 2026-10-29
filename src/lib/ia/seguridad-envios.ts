import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { buscarFamilia, buscarProducto, cargarFamiliasSeguridad } from "@/lib/ia/catalogo-seguridad";
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
    const ok = await enviarYRegistrar(sb, ctx, png, "image/png", `Opciones-${familia.clave}.png`, `${marca} instalados llave en mano. Precios sin factura (con factura se agrega IVA).`);
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

const MAX_FOTOS_PRODUCTO = 4;

/**
 * Envía las fotos del producto de seguridad que el cliente eligió (una sola vez por expediente y
 * producto) y deja en la bitácora qué opción eligió, para que el asesor arme la propuesta.
 */
export async function enviarFotosProductoSeguridad(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; agente: string; productoId: string }
): Promise<number> {
  try {
    const producto = buscarProducto(await cargarFamiliasSeguridad(sb, { soloAptosIa: true }), ctx.productoId);
    if (!producto) return 0;
    const marca = `Fotos de ${producto.nombre}`;
    if (await yaEnviado(sb, ctx.expedienteId, marca)) return 0;

    let enviadas = 0;
    for (const f of producto.fotos.slice(0, MAX_FOTOS_PRODUCTO)) {
      const res = await fetch(f.url);
      if (!res.ok) {
        console.warn(`[Seguridad] No se pudo descargar la foto ${f.url} (${res.status}).`);
        continue;
      }
      const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      if (!mime.startsWith("image/")) continue;
      const ext = mime.includes("png") ? "png" : "jpg";
      const caption = `${marca}${f.titulo ? ` — ${f.titulo}` : ""}`;
      if (await enviarYRegistrar(sb, ctx, Buffer.from(await res.arrayBuffer()), mime, `${producto.id}-${enviadas + 1}.${ext}`, caption)) enviadas++;
    }
    // Sólo con fotos enviadas: es lo que evita repetir la actividad en cada turno (yaEnviado)
    if (enviadas > 0 && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: `El cliente eligió: ${producto.nombre}`,
        detalle: `${producto.familia} · $${producto.precio.toLocaleString("es-MX")} · ${enviadas} foto(s) enviadas por Sofía.`,
      });
    }
    return enviadas;
  } catch (err) {
    console.error("[Seguridad] Error al enviar fotos del producto:", err);
    return 0;
  }
}
