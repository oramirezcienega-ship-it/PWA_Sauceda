/* eslint-disable @next/next/no-img-element */
import { rutaLogo, type TonoLogo, type VarianteLogo } from "@/lib/marca";

interface LogoProps {
  /** horizontal = logo principal (headers, documentos); simbolo = ícono; vertical = portadas. */
  variante?: VarianteLogo;
  /** color = sobre fondos claros; negativo = sobre verde profundo o carbón. */
  tono?: TonoLogo;
  /** Agrega "CONSTRUCCIÓN · MANTENIMIENTO · BIENES RAÍCES" (solo horizontal, a partir de ~400 px de ancho). */
  descriptor?: boolean;
  className?: string;
}

/**
 * Logo oficial SAUCEDA v3 (paquete de marca, octubre 2026). Usar siempre este
 * componente en pantallas e impresos: no deformar ni recolorear (className solo
 * debe fijar alto o ancho, nunca ambos).
 */
export function Logo({ variante = "horizontal", tono = "color", descriptor = false, className }: LogoProps) {
  return <img src={rutaLogo(variante, tono, descriptor)} alt="SAUCEDA" className={className} draggable={false} />;
}

/**
 * Membrete de documentos (recibos, remisiones, garantías, contratos, reportes):
 * logo horizontal + línea de giro. A tamaño de membrete el descriptor del logo no
 * se lee (mínimo 60 mm), por eso el giro va como texto aparte.
 */
export function MembreteMarca({
  className = "",
  alto = "h-11",
  linea = "Construcción · Mantenimiento · Bienes Raíces · León, Gto.",
  centrado = false,
}: {
  className?: string;
  /** Clase de alto del logo (Tailwind). */
  alto?: string;
  linea?: string | null;
  centrado?: boolean;
}) {
  return (
    <div className={`${centrado ? "flex flex-col items-center text-center" : ""} ${className}`}>
      <Logo variante="horizontal" className={`${alto} w-auto`} />
      {linea && (
        <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-sauce">{linea}</p>
      )}
    </div>
  );
}
