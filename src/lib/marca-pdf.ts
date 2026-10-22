import type { jsPDF } from "jspdf";
import { LOGO_HORIZONTAL_COLOR_PNG, LOGO_HORIZONTAL_NEGATIVO_PNG } from "@/lib/marca-logo-png";

/** Proporción ancho / alto del logo horizontal (PNG 800 × 216). */
const PROPORCION = 800 / 216;

/**
 * Dibuja el logo horizontal SAUCEDA v3 en un PDF de jsPDF (sin deformar).
 * `alto` en las unidades del documento (mm). color = fondo claro; negativo = fondo verde/carbón.
 * Devuelve el ancho dibujado. `alineacion: "derecha"` toma `x` como borde derecho.
 */
export function dibujarLogoPdf(
  doc: jsPDF,
  x: number,
  y: number,
  alto: number,
  tono: "color" | "negativo" = "color",
  alineacion: "izquierda" | "derecha" = "izquierda"
): number {
  const ancho = alto * PROPORCION;
  const xFinal = alineacion === "derecha" ? x - ancho : x;
  const img = tono === "negativo" ? LOGO_HORIZONTAL_NEGATIVO_PNG : LOGO_HORIZONTAL_COLOR_PNG;
  try {
    doc.addImage(img, "PNG", xFinal, y, ancho, alto, `logo-sauceda-${tono}`, "FAST");
  } catch (err) {
    // Si el PNG no se puede incrustar, el documento sale igual con el nombre en texto.
    console.warn("[marca-pdf] No se pudo dibujar el logo:", err);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(alto * 1.8);
    doc.text("SAUCEDA", xFinal, y + alto * 0.75);
  }
  return ancho;
}
