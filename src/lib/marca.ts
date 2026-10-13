/**
 * Datos de marca / contacto de SAUCEDA, usados en correos y el portal.
 */
export const MARCA = {
  web: "https://saucedamx.com",
  // Número de WhatsApp del negocio en formato internacional, solo dígitos:
  whatsapp: "524774654700",
  whatsappTexto: "477 465 4700",
  facebook: "https://www.facebook.com/profile.php?id=61589957630232",
  tiktok: "https://www.tiktok.com/@saucedamxbr",
  instagram: "https://www.instagram.com/saucedamx_/",
};

// Identidad SAUCEDA v3 (paquete de logos octubre 2026). Los archivos viven en public/brand/.
// Reglas del manual: no deformar, no recolorear, sin efectos; tamaño mínimo del
// horizontal 80 px (25 mm) y del símbolo 16 px (8 mm). El descriptor solo desde 400 px (60 mm).

export type VarianteLogo = "horizontal" | "simbolo" | "vertical";
export type TonoLogo = "color" | "negativo";

export function rutaLogo(variante: VarianteLogo = "horizontal", tono: TonoLogo = "color", descriptor = false): string {
  if (variante === "simbolo") return `/brand/simbolo-${tono}.svg`;
  if (variante === "vertical") return `/brand/vertical-${tono}.svg`;
  return `/brand/horizontal-${descriptor ? "descriptor-" : ""}${tono}.svg`;
}

export const PALETA_MARCA = {
  verdeProfundo: "#2D4A2B",
  verdeSauce: "#5C7A52",
  doradoTierra: "#C9A961",
  cremaMarfil: "#F5F1E8",
  negroCarbon: "#1A1A1A",
} as const;
