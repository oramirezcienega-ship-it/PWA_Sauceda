import { sincronizarMetaAds } from "../../src/features/marketing/meta-ads";

/**
 * Netlify Scheduled Function (diaria, ver netlify.toml): baja de Meta Ads el gasto
 * del mes en curso y del anterior, actualiza el Dashboard Inteligente y lo refleja
 * en el estado de resultados. Usa META_ADS_ACCESS_TOKEN y META_AD_ACCOUNT_ID.
 */
export const handler = async () => {
  try {
    const r = await sincronizarMetaAds();
    console.log("[sincronizar-meta-ads]", JSON.stringify(r));
    return { statusCode: r.ok ? 200 : 500, body: JSON.stringify(r) };
  } catch (err) {
    console.error("[sincronizar-meta-ads]", err);
    return { statusCode: 500, body: String(err) };
  }
};
