import { despacharPendientes } from "../../src/features/llamadas-ia/service";

/**
 * Netlify Scheduled Function (cada 5 min, ver netlify.toml): marca las llamadas
 * IA aprobadas cuya hora ya llegó. Fuera de horario o con el tope diario
 * alcanzado no hace nada.
 */
export const handler = async () => {
  try {
    const r = await despacharPendientes();
    if (r.despachadas || r.errores.length) console.log("[despachar-llamadas-ia]", JSON.stringify(r));
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...r }) };
  } catch (err) {
    console.error("[despachar-llamadas-ia]", err);
    return { statusCode: 500, body: String(err) };
  }
};
