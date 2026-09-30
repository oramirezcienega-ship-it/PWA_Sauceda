"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Hoja imprimible de la póliza de garantía:
 *  - Al imprimir / guardar PDF se ajusta sola para caber en UNA hoja carta (márgenes de 10 mm),
 *    reduciendo la escala solo lo necesario según el largo del texto.
 *  - El nombre sugerido del PDF es "Póliza de garantía - Cliente - Referencia"
 *    (mismo estilo que los demás documentos: contratos, reportes).
 */

const PX_POR_MM = 96 / 25.4;
const ANCHO_UTIL_MM = 195.9; // carta (215.9 mm) − 2 × 10 mm
const ALTO_UTIL_PX = (279.4 - 20) * PX_POR_MM * 0.97; // 3 % de holgura para que no salte a otra hoja

// Reglas compactas de la hoja; {SEL} se sustituye por el selector del modo impresión o medición.
const COMPACTO = `
{SEL}{box-sizing:border-box;width:calc(${ANCHO_UTIL_MM}mm / var(--poliza-z,1))!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#fff!important}
{SEL} .poliza-encabezado{margin-bottom:6mm!important;padding-bottom:4mm!important}
{SEL} .poliza-bloque{margin-bottom:5mm!important}
{SEL} pre{font-size:10.5px!important;line-height:1.45!important}
{SEL} article{margin:3mm 0!important}
{SEL} .poliza-firmas{margin-top:14mm!important;padding-top:6mm!important;break-inside:avoid}
{SEL} .poliza-pie{margin-top:8mm!important;padding-top:3mm!important}
`;

function construirCss(): string {
  return [
    "@page poliza{size:letter;margin:10mm}",
    `@media print{.poliza-hoja{page:poliza;zoom:var(--poliza-z,1)}${COMPACTO.replaceAll("{SEL}", ".poliza-hoja")}}`,
    COMPACTO.replaceAll("{SEL}", '.poliza-hoja[data-poliza-medir]'),
  ].join("\n");
}

export function PolizaHoja({
  children,
  className = "",
  tituloArchivo,
}: {
  children: ReactNode;
  className?: string;
  /** Nombre sugerido al guardar como PDF (sin extensión). */
  tituloArchivo: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const original = document.title;

    // Calcula la escala para que todo el contenido quepa en una hoja
    const ajustar = () => {
      const el = ref.current;
      if (!el) return;
      document.title = tituloArchivo.replace(/[\\/:*?"<>|]/g, "-");
      el.setAttribute("data-poliza-medir", "");
      let z = 1;
      for (let i = 0; i < 6; i++) {
        el.style.setProperty("--poliza-z", String(z));
        const h = el.offsetHeight;
        const nuevo = Math.min(1, Math.max(0.4, ALTO_UTIL_PX / Math.max(h, 1)));
        const estable = Math.abs(nuevo - z) < 0.005;
        z = nuevo;
        if (estable) break;
      }
      el.removeAttribute("data-poliza-medir");
      el.style.setProperty("--poliza-z", String(z));
    };

    const restaurar = () => {
      document.title = original;
    };

    window.addEventListener("beforeprint", ajustar);
    window.addEventListener("afterprint", restaurar);
    return () => {
      window.removeEventListener("beforeprint", ajustar);
      window.removeEventListener("afterprint", restaurar);
      document.title = original;
    };
  }, [tituloArchivo]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: construirCss() }} />
      <div ref={ref} className={`poliza-hoja ${className}`}>
        {children}
      </div>
    </>
  );
}
