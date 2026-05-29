import Link from "next/link";
import { CerrarSesion } from "./CerrarSesion";

/**
 * Encabezado de marca SAUCEDA (panel del admin).
 * Logo en Fraunces (display) + tagline + cerrar sesión.
 * Verde como color dominante del 30%.
 */
export function Encabezado() {
  return (
    <header className="sticky top-0 z-20 border-b border-dorado/30 bg-verde-profundo text-crema">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex flex-col leading-none">
          <span className="font-display text-2xl font-semibold tracking-tight">
            SAUCEDA
          </span>
          <span className="font-cuerpo text-[11px] uppercase tracking-[0.2em] text-dorado">
            Bienes Raíces
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden font-titular text-sm italic text-crema/80 sm:block">
            Tradición con tecnología.
          </span>
          <CerrarSesion />
        </div>
      </div>
    </header>
  );
}
